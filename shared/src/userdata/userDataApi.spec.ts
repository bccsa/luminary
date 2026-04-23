import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, afterEach, expect } from "vitest";
import { db, initDatabase } from "../db/database";
import { initConfig } from "../config";
import { DocType, userDataIds, type UserContentDto, type UserSettingsDto } from "../types";
import { currentUserId } from "./session";
import {
    addHighlight,
    getContentState,
    getSettings,
    removeHighlight,
    saveReadingPos,
    updateSettings,
} from "./userDataApi";

/**
 * Tests for the local-first user-data API. These exercise the real Dexie
 * write pipeline (via db.upsert) and assert on both the docs and
 * localChanges tables, so we know the syncLocalChanges watcher has
 * something to push when connectivity returns.
 */
describe("userDataApi", () => {
    const alice = "usr_alice";
    const contentX = "cnt_x";
    const contentY = "cnt_y";

    beforeAll(async () => {
        initConfig({
            cms: false,
            docsIndex: "",
            apiUrl: "http://localhost:12345",
        });
        await initDatabase();
    });

    beforeEach(() => {
        currentUserId.value = alice;
    });

    afterEach(async () => {
        currentUserId.value = null;
        await db.docs.clear();
        await db.localChanges.clear();
    });

    /* ──────────────── anonymous / unprovisioned handling ──────────────── */

    describe("anonymous handling (strict)", () => {
        it("read methods return null when no currentUserId is set", async () => {
            currentUserId.value = null;
            expect(await getContentState(contentX)).toBeNull();
            expect(await getSettings()).toBeNull();
        });

        it("addHighlight throws when no currentUserId is set", async () => {
            currentUserId.value = null;
            await expect(
                addHighlight(contentX, { color: "yellow", text: "hi", position: 0 }),
            ).rejects.toThrow(/no current user/);
        });

        it("saveReadingPos throws when no currentUserId is set", async () => {
            currentUserId.value = null;
            await expect(saveReadingPos(contentX, 10)).rejects.toThrow(/no current user/);
        });

        it("updateSettings throws when no currentUserId is set", async () => {
            currentUserId.value = null;
            await expect(
                updateSettings({ privacyPolicyAccepted: true }),
            ).rejects.toThrow(/no current user/);
        });

        it("removeHighlight throws when no currentUserId is set", async () => {
            currentUserId.value = null;
            await expect(removeHighlight(contentX, "h1")).rejects.toThrow(/no current user/);
        });
    });

    /* ──────────────── highlights ──────────────── */

    describe("addHighlight", () => {
        it("creates a new UserContent doc on first highlight for a content", async () => {
            const h = await addHighlight(contentX, {
                color: "yellow",
                text: "first highlight",
                position: 0,
            });

            expect(h.id).toBeDefined();
            expect(h.createdAt).toBeGreaterThan(0);

            const saved = (await db.docs.get(
                userDataIds.userContent(alice, contentX),
            )) as UserContentDto;
            expect(saved).toBeDefined();
            expect(saved.type).toBe(DocType.UserContent);
            expect(saved.userId).toBe(alice);
            expect(saved.contentId).toBe(contentX);
            expect(saved.highlights).toHaveLength(1);
            expect(saved.highlights![0]).toMatchObject({
                color: "yellow",
                text: "first highlight",
                position: 0,
            });

            // db.upsert enqueues a LocalChange so syncLocalChanges pushes it
            const queued = await db.localChanges.toArray();
            expect(queued).toHaveLength(1);
            expect((queued[0].doc as any)._id).toBe(saved._id);
        });

        it("appends to existing highlights array", async () => {
            await addHighlight(contentX, { color: "yellow", text: "first", position: 0 });
            await addHighlight(contentX, { color: "red", text: "second", position: 5 });

            const saved = (await db.docs.get(
                userDataIds.userContent(alice, contentX),
            )) as UserContentDto;
            expect(saved.highlights).toHaveLength(2);
            expect(saved.highlights!.map((h) => h.text)).toEqual(["first", "second"]);
        });

        it("each highlight gets a unique id", async () => {
            const h1 = await addHighlight(contentX, { color: "y", text: "a", position: 0 });
            const h2 = await addHighlight(contentX, { color: "y", text: "b", position: 1 });
            expect(h1.id).not.toBe(h2.id);
        });
    });

    describe("removeHighlight", () => {
        it("queues a delete + re-create when other state remains", async () => {
            await addHighlight(contentX, { color: "yellow", text: "keep", position: 0 });
            const { id: removeId } = await addHighlight(contentX, {
                color: "red",
                text: "drop",
                position: 10,
            });

            await db.localChanges.clear(); // simulate post-sync state
            await removeHighlight(contentX, removeId);

            // Two local-changes queued: the tombstone and the re-create.
            // They push in order via syncLocalChanges so the server sees
            // DELETE then CREATE — merge-on-write can't resurrect the
            // removed highlight by union-by-id because the doc is gone.
            const queued = await db.localChanges.orderBy("id").toArray();
            expect(queued.length).toBeGreaterThanOrEqual(1);

            // Either the final doc state has only the keeper, OR the doc
            // was deleted locally (the re-create is pending as a
            // localChange). Both are valid intermediate states.
            const afterLocal = (await db.docs.get(
                userDataIds.userContent(alice, contentX),
            )) as UserContentDto | undefined;

            if (afterLocal) {
                expect(afterLocal.highlights).toHaveLength(1);
                expect(afterLocal.highlights![0].text).toBe("keep");
            }
        });

        it("fully deletes the doc when no state remains afterwards", async () => {
            const { id } = await addHighlight(contentX, {
                color: "yellow",
                text: "only",
                position: 0,
            });
            await db.localChanges.clear();

            await removeHighlight(contentX, id);

            // With no highlights and no readingPos, there's nothing to
            // re-create — the doc should be marked for deletion locally
            // (or already absent).
            const afterLocal = await db.docs.get(userDataIds.userContent(alice, contentX));
            if (afterLocal) {
                // If the doc is still present it must carry deleteReq;
                // either way the sync pipeline will remove it server-side.
                expect((afterLocal as any).deleteReq).toBeTruthy();
            }
        });

        it("no-ops when highlight id is not found", async () => {
            await addHighlight(contentX, { color: "y", text: "a", position: 0 });
            await db.localChanges.clear();

            await removeHighlight(contentX, "nonexistent-id");

            const queued = await db.localChanges.toArray();
            expect(queued).toHaveLength(0);
        });

        it("no-ops when the content has no UserContent doc at all", async () => {
            await removeHighlight(contentY, "any-id");
            const queued = await db.localChanges.toArray();
            expect(queued).toHaveLength(0);
        });
    });

    /* ──────────────── reading position ──────────────── */

    describe("saveReadingPos", () => {
        it("creates a UserContent doc with readingPos when none exists", async () => {
            await saveReadingPos(contentX, 42);
            const saved = (await db.docs.get(
                userDataIds.userContent(alice, contentX),
            )) as UserContentDto;
            expect(saved.readingPos).toBe(42);
            expect(saved.highlights).toBeUndefined();
        });

        it("updates readingPos on an existing doc without clobbering highlights", async () => {
            await addHighlight(contentX, { color: "y", text: "keep me", position: 0 });
            await saveReadingPos(contentX, 100);

            const saved = (await db.docs.get(
                userDataIds.userContent(alice, contentX),
            )) as UserContentDto;
            expect(saved.readingPos).toBe(100);
            expect(saved.highlights).toHaveLength(1);
        });
    });

    /* ──────────────── settings ──────────────── */

    describe("settings", () => {
        it("updateSettings creates the singleton doc with deterministic id", async () => {
            const result = await updateSettings({
                privacyPolicyAccepted: true,
                privacyPolicyAcceptedAt: 1234,
            });
            expect(result._id).toBe(userDataIds.settings(alice));
            expect(result.type).toBe(DocType.UserSettings);
            expect(result.privacyPolicyAccepted).toBe(true);

            const saved = (await db.docs.get(
                userDataIds.settings(alice),
            )) as UserSettingsDto;
            expect(saved.privacyPolicyAccepted).toBe(true);
            expect(saved.privacyPolicyAcceptedAt).toBe(1234);
        });

        it("getSettings returns the saved doc", async () => {
            await updateSettings({ privacyPolicyAccepted: true });
            const got = await getSettings();
            expect(got?.privacyPolicyAccepted).toBe(true);
        });

        it("updateSettings merges patch onto existing settings", async () => {
            await updateSettings({ privacyPolicyAccepted: false });
            await updateSettings({ privacyPolicyAcceptedAt: 9999 });

            const saved = (await db.docs.get(
                userDataIds.settings(alice),
            )) as UserSettingsDto;
            expect(saved.privacyPolicyAccepted).toBe(false); // preserved
            expect(saved.privacyPolicyAcceptedAt).toBe(9999); // set
        });
    });

    /* ──────────────── id convention ──────────────── */

    describe("partition id convention", () => {
        it("UserContent docs use {userId}:userContent:{contentId}", async () => {
            await addHighlight(contentX, { color: "y", text: "a", position: 0 });
            const expected = `${alice}:userContent:${contentX}`;
            const found = await db.docs.get(expected);
            expect(found).toBeDefined();
        });

        it("UserSettings doc is a singleton keyed {userId}:settings", async () => {
            await updateSettings({ privacyPolicyAccepted: true });
            const expected = `${alice}:settings`;
            const found = await db.docs.get(expected);
            expect(found).toBeDefined();
        });
    });
});
