import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

import type { HighlightRange } from "@/util/highlightRanges";
import { userActivityDb } from "../db";
import {
    MAX_VIEWED,
    TOMBSTONE_TTL_MS,
    clearUserActivity,
    getUserActivity,
    hasUserActivity,
    pruneUserActivityTombstones,
    recordUserActivity,
    removeUserActivity,
    userActivityId,
} from "../store";

describe("userActivity", () => {
    beforeEach(async () => {
        await userActivityDb.userActivity.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const range = (text: string): HighlightRange => ({
        start: 0,
        end: text.length,
        color: "yellow",
        text,
    });

    // Dexie deadlocks under Vitest's fake timers (fake-indexeddb schedules its own work),
    // so time is controlled by stubbing the clock these helpers read.
    const at = (ms: number) => vi.spyOn(Date, "now").mockReturnValue(ms);

    describe("identity", () => {
        it("keys likes and views on the post", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });

            const row = await userActivityDb.userActivity.get("liked:post-1");
            expect(row).toMatchObject({ type: "liked", parentId: "post-1" });
            expect(row!.contentId).toBeUndefined();
            expect(row!.updatedTimeUtc).toBeGreaterThan(0);
        });

        it("keys highlights on the translation while keeping the post", async () => {
            await recordUserActivity(
                { type: "highlighted", contentId: "content-1", parentId: "post-1" },
                { ranges: [range("hi")] },
            );

            const row = await userActivityDb.userActivity.get("highlighted:content-1");
            expect(row).toMatchObject({
                type: "highlighted",
                contentId: "content-1",
                parentId: "post-1",
            });
            expect(row!.payload).toEqual({ ranges: [range("hi")] });
        });

        it("keeps two translations of one post as separate highlights", async () => {
            await recordUserActivity({
                type: "highlighted",
                contentId: "content-eng",
                parentId: "post-1",
            });
            await recordUserActivity({
                type: "highlighted",
                contentId: "content-fra",
                parentId: "post-1",
            });

            expect(await getUserActivity("highlighted")).toHaveLength(2);
        });

        it("keeps the three activities of one post apart", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            await recordUserActivity({ type: "viewed", parentId: "post-1" });
            await recordUserActivity({
                type: "highlighted",
                contentId: "content-1",
                parentId: "post-1",
            });

            expect(await userActivityDb.userActivity.count()).toBe(3);
        });

        it("counts viewing two translations as one post viewed", async () => {
            at(1000);
            await recordUserActivity({ type: "viewed", parentId: "post-1" });
            at(2000);
            await recordUserActivity({ type: "viewed", parentId: "post-1" });

            const viewed = await getUserActivity("viewed");
            expect(viewed).toHaveLength(1);
            expect(viewed[0].updatedTimeUtc).toBe(2000);
        });
    });

    describe("unresolved parents", () => {
        it("records a highlight whose post is not known yet", async () => {
            await recordUserActivity({ type: "highlighted", contentId: "content-1" });

            const row = await userActivityDb.userActivity.get("highlighted:content-1");
            expect(row!.contentId).toBe("content-1");
            expect(row!.parentId).toBeUndefined();
        });

        it("does not erase a resolved post when re-recording without one", async () => {
            await recordUserActivity({
                type: "highlighted",
                contentId: "content-1",
                parentId: "post-1",
            });
            await recordUserActivity({ type: "highlighted", contentId: "content-1" });

            expect((await userActivityDb.userActivity.get("highlighted:content-1"))!.parentId).toBe(
                "post-1",
            );
        });
    });

    describe("reading", () => {
        it("returns activities newest first", async () => {
            at(1000);
            await recordUserActivity({ type: "viewed", parentId: "older" });
            at(2000);
            await recordUserActivity({ type: "viewed", parentId: "newer" });

            expect((await getUserActivity("viewed")).map((r) => r.parentId)).toEqual([
                "newer",
                "older",
            ]);
        });

        it("honours a limit", async () => {
            at(1000);
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            at(2000);
            await recordUserActivity({ type: "liked", parentId: "post-2" });

            const liked = await getUserActivity("liked", 1);
            expect(liked.map((r) => r.parentId)).toEqual(["post-2"]);
        });
    });

    describe("removal", () => {
        it("tombstones a removal instead of dropping the row", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            await removeUserActivity({ type: "liked", parentId: "post-1" });

            expect(await userActivityDb.userActivity.count()).toBe(1);
            expect((await userActivityDb.userActivity.get("liked:post-1"))!.deleted).toBe(true);
            expect(await getUserActivity("liked")).toEqual([]);
            expect(await hasUserActivity({ type: "liked", parentId: "post-1" })).toBe(false);
        });

        it("drops the payload of a removed highlight", async () => {
            await recordUserActivity(
                { type: "highlighted", contentId: "content-1", parentId: "post-1" },
                { ranges: [range("secret")] },
            );
            await removeUserActivity({ type: "highlighted", contentId: "content-1" });

            expect(
                (await userActivityDb.userActivity.get("highlighted:content-1"))!.payload,
            ).toBeUndefined();
        });

        it("revives a tombstoned activity when it is recorded again", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            await removeUserActivity({ type: "liked", parentId: "post-1" });
            await recordUserActivity({ type: "liked", parentId: "post-1" });

            expect(await hasUserActivity({ type: "liked", parentId: "post-1" })).toBe(true);
            expect(await userActivityDb.userActivity.count()).toBe(1);
        });

        it("does not tombstone an activity that was never recorded", async () => {
            await removeUserActivity({ type: "liked", parentId: "never-liked" });

            expect(await userActivityDb.userActivity.count()).toBe(0);
        });
    });

    describe("bounds", () => {
        it("caps viewed at MAX_VIEWED, dropping the oldest", async () => {
            for (let i = 0; i < MAX_VIEWED + 5; i++) {
                at(1000 + i);
                await recordUserActivity({ type: "viewed", parentId: `post-${i}` });
            }

            const viewed = await getUserActivity("viewed");
            expect(viewed).toHaveLength(MAX_VIEWED);
            expect(viewed[0].parentId).toBe(`post-${MAX_VIEWED + 4}`);
            expect(await userActivityDb.userActivity.get("viewed:post-0")).toBeUndefined();
        });

        it("does not cap likes or highlights", async () => {
            for (let i = 0; i < MAX_VIEWED + 5; i++) {
                at(1000 + i);
                await recordUserActivity({ type: "liked", parentId: `post-${i}` });
            }

            expect(await getUserActivity("liked")).toHaveLength(MAX_VIEWED + 5);
        });

        it("prunes only tombstones past the TTL", async () => {
            at(1_000_000_000);
            await recordUserActivity({ type: "liked", parentId: "old-removal" });
            await removeUserActivity({ type: "liked", parentId: "old-removal" });
            await recordUserActivity({ type: "liked", parentId: "kept" });

            await pruneUserActivityTombstones(1_000_000_000 + TOMBSTONE_TTL_MS + 1);

            expect(await userActivityDb.userActivity.count()).toBe(1);
            expect(await hasUserActivity({ type: "liked", parentId: "kept" })).toBe(true);
        });

        it("clears everything on request", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            await recordUserActivity({ type: "viewed", parentId: "post-2" });

            await clearUserActivity();

            expect(await userActivityDb.userActivity.count()).toBe(0);
        });
    });

    it("builds ids from the type's own identity", () => {
        expect(userActivityId({ type: "liked", parentId: "post-1" })).toBe("liked:post-1");
        expect(userActivityId({ type: "viewed", parentId: "post-1" })).toBe("viewed:post-1");
        expect(
            userActivityId({ type: "highlighted", contentId: "content-1", parentId: "post-1" }),
        ).toBe("highlighted:content-1");
    });
});
