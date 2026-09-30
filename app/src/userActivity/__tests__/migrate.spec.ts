import "fake-indexeddb/auto";
import { describe, it, beforeEach, expect } from "vitest";
import { db, DocType, type ContentDto } from "luminary-shared";

import { userPreferencesAsRef } from "@/globalConfig";
import { userActivityDb } from "../db";
import {
    migrateBookmarksToUserActivity,
    migrateHighlightsToUserActivity,
    migrateToUserActivity,
} from "../migrate";
import {
    getUserActivity,
    recordUserActivity,
    removeUserActivity,
    resolveUnresolvedParents,
} from "../store";

const contentDoc = (_id: string, parentId: string) =>
    ({
        _id,
        type: DocType.Content,
        parentId,
        updatedTimeUtc: 1,
        memberOf: [],
    }) as unknown as ContentDto;

describe("migration to userActivity", () => {
    beforeEach(async () => {
        await userActivityDb.userActivity.clear();
        await db.docs.clear();
        await db.setLuminaryInternals("highlights", undefined);
        delete userPreferencesAsRef.value.bookmarks;
    });

    describe("bookmarks", () => {
        it("moves bookmarks in as liked rows keyed on the post", async () => {
            userPreferencesAsRef.value.bookmarks = [
                { id: "post-1", ts: 1000 },
                { id: "post-2", ts: 2000 },
            ];

            expect(await migrateBookmarksToUserActivity()).toBe(2);

            const liked = await getUserActivity("liked");
            expect(liked.map((row) => row.parentId)).toEqual(["post-2", "post-1"]);
            expect(liked[1].updatedTimeUtc).toBe(1000);
            expect(await userActivityDb.userActivity.get("liked:post-1")).toBeDefined();
        });

        it("clears the source so a second run is a no-op", async () => {
            userPreferencesAsRef.value.bookmarks = [{ id: "post-1", ts: 1000 }];

            await migrateBookmarksToUserActivity();

            expect(userPreferencesAsRef.value.bookmarks).toBeUndefined();
            expect(await migrateBookmarksToUserActivity()).toBe(0);
            expect(await userActivityDb.userActivity.count()).toBe(1);
        });

        it("does not revive a like the user has since removed", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            await removeUserActivity({ type: "liked", parentId: "post-1" });
            userPreferencesAsRef.value.bookmarks = [{ id: "post-1", ts: 1000 }];

            await migrateBookmarksToUserActivity();

            expect(await getUserActivity("liked")).toEqual([]);
        });
    });

    describe("highlights", () => {
        it("resolves the post from the Content document", async () => {
            await db.docs.bulkPut([contentDoc("content-1", "post-1")]);
            await db.setLuminaryInternals("highlights", {
                "content-1": { html: "<mark>hi</mark>", updatedAt: 1234 },
            });

            expect(await migrateHighlightsToUserActivity()).toBe(1);

            const row = await userActivityDb.userActivity.get("highlighted:content-1");
            expect(row).toMatchObject({
                type: "highlighted",
                contentId: "content-1",
                parentId: "post-1",
                updatedTimeUtc: 1234,
            });
            expect(row!.payload).toEqual({ html: "<mark>hi</mark>" });
        });

        it("keeps a highlight whose Content document is not local, with no parent", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-unsynced": { html: "<mark>hi</mark>", updatedAt: 1234 },
            });

            expect(await migrateHighlightsToUserActivity()).toBe(1);

            const row = await userActivityDb.userActivity.get("highlighted:content-unsynced");
            expect(row!.parentId).toBeUndefined();
            expect(row!.payload).toEqual({ html: "<mark>hi</mark>" });
        });

        it("reads the legacy string shape and sorts it last", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-legacy": "<mark>old</mark>",
            });

            await migrateHighlightsToUserActivity();

            const row = await userActivityDb.userActivity.get("highlighted:content-legacy");
            expect(row!.updatedTimeUtc).toBe(0);
            expect(row!.payload).toEqual({ html: "<mark>old</mark>" });
        });

        it("leaves the source in place and stays safe to re-run", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-1": { html: "<mark>hi</mark>", updatedAt: 1234 },
            });

            await migrateHighlightsToUserActivity();
            expect(await migrateHighlightsToUserActivity()).toBe(0);

            expect(await db.getLuminaryInternals("highlights")).toBeDefined();
            expect(await userActivityDb.userActivity.count()).toBe(1);
        });

        it("ignores entries carrying no highlight html", async () => {
            await db.setLuminaryInternals("highlights", { "content-1": { updatedAt: 1 } });

            expect(await migrateHighlightsToUserActivity()).toBe(0);
        });
    });

    describe("resolveUnresolvedParents", () => {
        it("fills in the post once its document arrives", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-1": { html: "<mark>hi</mark>", updatedAt: 1234 },
            });
            await migrateHighlightsToUserActivity();

            await db.docs.bulkPut([contentDoc("content-1", "post-1")]);
            expect(await resolveUnresolvedParents()).toBe(1);

            expect((await userActivityDb.userActivity.get("highlighted:content-1"))!.parentId).toBe(
                "post-1",
            );
        });

        it("does nothing while the document is still missing", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-1": { html: "<mark>hi</mark>", updatedAt: 1234 },
            });
            await migrateHighlightsToUserActivity();

            expect(await resolveUnresolvedParents()).toBe(0);
            expect(await userActivityDb.userActivity.count()).toBe(1);
        });

        it("leaves resolved rows alone", async () => {
            await db.docs.bulkPut([contentDoc("content-1", "post-1")]);
            await db.setLuminaryInternals("highlights", {
                "content-1": { html: "<mark>hi</mark>", updatedAt: 1234 },
            });
            await migrateHighlightsToUserActivity();

            expect(await resolveUnresolvedParents()).toBe(0);
        });
    });

    it("runs both passes together", async () => {
        userPreferencesAsRef.value.bookmarks = [{ id: "post-1", ts: 1000 }];
        await db.docs.bulkPut([contentDoc("content-1", "post-2")]);
        await db.setLuminaryInternals("highlights", {
            "content-1": { html: "<mark>hi</mark>", updatedAt: 1234 },
        });

        await migrateToUserActivity();

        expect(await userActivityDb.userActivity.count()).toBe(2);
        expect(await getUserActivity("liked")).toHaveLength(1);
        expect(await getUserActivity("highlighted")).toHaveLength(1);
    });
});
