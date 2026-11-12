import "fake-indexeddb/auto";
import { describe, it, beforeEach, expect } from "vitest";
import { db, DocType, type ContentDto, type HighlightRange } from "luminary-shared";

import {
    migrateLikesToUserActivity,
    migrateHighlightsToUserActivity,
    migrateSeenToUserActivity,
    migrateToUserActivity,
} from "../migrate";
import {
    clearUserActivity,
    getUserActivity,
    recordUserActivity,
    removeUserActivity,
} from "../store";

const range = (text: string, start = 0): HighlightRange => ({
    start,
    end: start + text.length,
    color: "yellow",
    text,
});

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
        localStorage.removeItem("seenArticleIds");
        await db.userActivity.clear();
        await db.docs.clear();
        await db.setLuminaryInternals("highlights", undefined);
    });

    describe("seen ids", () => {
        const storeSeen = (ids: unknown) =>
            localStorage.setItem("seenArticleIds", JSON.stringify(ids));

        it("moves seen translations in as one viewed row per post, dated 0", async () => {
            await db.docs.bulkPut([
                contentDoc("content-1-eng", "post-1"),
                contentDoc("content-1-fra", "post-1"),
                contentDoc("content-2-eng", "post-2"),
            ]);
            storeSeen(["content-1-eng", "content-1-fra", "content-2-eng"]);

            expect(await migrateSeenToUserActivity()).toBe(2);

            const rows = await getUserActivity("viewed");
            expect(rows.map((row) => row.parentId).sort()).toEqual(["post-1", "post-2"]);
            expect(rows.every((row) => row.updatedTimeUtc === 0)).toBe(true);
            expect(localStorage.getItem("seenArticleIds")).toBeNull();
        });

        it("never overwrites a row that is already recorded", async () => {
            await db.docs.bulkPut([contentDoc("content-1-eng", "post-1")]);
            await recordUserActivity({ type: "viewed", parentId: "post-1" });
            const before = await getUserActivity("viewed");
            storeSeen(["content-1-eng"]);

            expect(await migrateSeenToUserActivity()).toBe(0);

            expect(await getUserActivity("viewed")).toEqual(before);
        });

        it("drops ids whose document is not local and runs only once", async () => {
            await db.docs.bulkPut([contentDoc("content-1-eng", "post-1")]);
            storeSeen(["content-1-eng", "content-missing"]);

            expect(await migrateSeenToUserActivity()).toBe(1);
            expect(localStorage.getItem("seenArticleIds")).toBeNull();

            await db.docs.bulkPut([contentDoc("content-missing", "post-9")]);
            expect(await migrateSeenToUserActivity()).toBe(0);
        });

        it("does nothing when there is no stored list, and drops a corrupt one", async () => {
            expect(await migrateSeenToUserActivity()).toBe(0);

            localStorage.setItem("seenArticleIds", "{not json");
            expect(await migrateSeenToUserActivity()).toBe(0);
            expect(localStorage.getItem("seenArticleIds")).toBeNull();
        });
    });

    describe("likes", () => {
        it("moves stored likes in as liked rows keyed on the post", async () => {
            const likes = [
                { id: "post-1", ts: 1000 },
                { id: "post-2", ts: 2000 },
            ];

            expect(await migrateLikesToUserActivity(likes)).toBe(2);

            const liked = await getUserActivity("liked");
            expect(liked.map((row) => row.parentId)).toEqual(["post-2", "post-1"]);
            expect(liked[1].updatedTimeUtc).toBe(1000);
            expect(await db.userActivity.get("liked:post-1")).toBeDefined();
        });

        it("stays safe to re-run on the same likes", async () => {
            const likes = [{ id: "post-1", ts: 1000 }];

            await migrateLikesToUserActivity(likes);

            expect(await migrateLikesToUserActivity(likes)).toBe(0);
            expect(await db.userActivity.count()).toBe(1);
        });

        it("does nothing without likes", async () => {
            expect(await migrateLikesToUserActivity(undefined)).toBe(0);
            expect(await migrateLikesToUserActivity([])).toBe(0);
        });

        it("does not revive a like the user has since removed", async () => {
            await recordUserActivity({ type: "liked", parentId: "post-1" });
            await removeUserActivity({ type: "liked", parentId: "post-1" });
            await migrateLikesToUserActivity([{ id: "post-1", ts: 1000 }]);

            expect(await getUserActivity("liked")).toEqual([]);
        });
    });

    describe("highlights", () => {
        it("resolves the post from the Content document", async () => {
            await db.docs.bulkPut([contentDoc("content-1", "post-1")]);
            await db.setLuminaryInternals("highlights", {
                "content-1": { ranges: [range("hi")], updatedAt: 1234 },
            });

            expect(await migrateHighlightsToUserActivity()).toBe(1);

            const row = await db.userActivity.get("highlighted:content-1");
            expect(row).toMatchObject({
                type: "highlighted",
                contentId: "content-1",
                parentId: "post-1",
                updatedTimeUtc: 1234,
            });
            expect(row!.payload).toEqual({ ranges: [range("hi")] });
        });

        it("takes the post stored with the entry without a lookup", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-1": { ranges: [range("hi")], updatedAt: 1234, parentId: "post-1" },
            });

            expect(await migrateHighlightsToUserActivity()).toBe(1);

            expect((await db.userActivity.get("highlighted:content-1"))!.parentId).toBe("post-1");
        });

        it("skips an entry whose post cannot be found, leaving it to a later run", async () => {
            await db.setLuminaryInternals("highlights", {
                "content-unsynced": { ranges: [range("hi")], updatedAt: 1234 },
            });

            expect(await migrateHighlightsToUserActivity()).toBe(0);
            expect(await db.userActivity.count()).toBe(0);

            // The source is untouched, so the entry is picked up once its document syncs.
            await db.docs.bulkPut([contentDoc("content-unsynced", "post-9")]);
            expect(await migrateHighlightsToUserActivity()).toBe(1);
            expect((await db.userActivity.get("highlighted:content-unsynced"))!.parentId).toBe(
                "post-9",
            );
        });

        it("converts a legacy HTML snapshot to ranges and sorts it last", async () => {
            await db.docs.bulkPut([contentDoc("content-legacy", "post-legacy")]);
            await db.setLuminaryInternals("highlights", {
                "content-legacy": "<p>before <mark>old</mark> after</p>",
            });

            await migrateHighlightsToUserActivity();

            const row = await db.userActivity.get("highlighted:content-legacy");
            const ranges = row!.payload!.ranges;
            expect(row!.updatedTimeUtc).toBe(0);
            expect(ranges).toHaveLength(1);
            expect(ranges[0].text).toBe("old");
        });

        it("leaves the source in place and stays safe to re-run", async () => {
            await db.docs.bulkPut([contentDoc("content-1", "post-1")]);
            await db.setLuminaryInternals("highlights", {
                "content-1": { ranges: [range("hi")], updatedAt: 1234 },
            });

            await migrateHighlightsToUserActivity();
            expect(await migrateHighlightsToUserActivity()).toBe(0);

            expect(await db.getLuminaryInternals("highlights")).toBeDefined();
            expect(await db.userActivity.count()).toBe(1);
        });

        it("ignores entries carrying no highlight at all", async () => {
            await db.setLuminaryInternals("highlights", { "content-1": { updatedAt: 1 } });

            expect(await migrateHighlightsToUserActivity()).toBe(0);
        });
    });

    it("runs both passes together", async () => {
        await db.docs.bulkPut([contentDoc("content-1", "post-2")]);
        await db.setLuminaryInternals("highlights", {
            "content-1": { ranges: [range("hi")], updatedAt: 1234 },
        });

        await migrateToUserActivity([{ id: "post-1", ts: 1000 }]);

        expect(await db.userActivity.count()).toBe(2);
        expect(await getUserActivity("liked")).toHaveLength(1);
        expect(await getUserActivity("highlighted")).toHaveLength(1);
    });

    it("does not bring highlights back after the activity is cleared", async () => {
        await db.docs.bulkPut([contentDoc("content-1", "post-1")]);
        await db.setLuminaryInternals("highlights", {
            "content-1": { ranges: [range("hi")], updatedAt: 1234 },
        });
        await migrateHighlightsToUserActivity();
        expect(await getUserActivity("highlighted")).toHaveLength(1);

        await clearUserActivity();

        // The next start runs the migration again; the source must be gone with the rows.
        await migrateHighlightsToUserActivity();
        expect(await getUserActivity("highlighted")).toEqual([]);
    });
});
