import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, expect, vi } from "vitest";
import { effectScope } from "vue";
import waitForExpect from "wait-for-expect";

// Real db (fake-indexeddb): a doc type with a Dexie table of its own name is read from that
// table, served locally and never asked of the API.
import { db, initDatabase } from "../../db/database";
import { initConfig } from "../../config";
import { HybridQuery, initHybridQuery, queryLocal } from "./HybridQuery";
import { DocType, type BaseDocumentDto } from "../../types";

const liked = (parentId: string, updatedTimeUtc: number) =>
    ({
        _id: `liked:${parentId}`,
        type: DocType.UserActivity,
        activity: "liked",
        parentId,
        updatedTimeUtc,
    }) as unknown as BaseDocumentDto;

const post = vi.fn();

describe("HybridQuery on a doc type with its own table", () => {
    beforeAll(async () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();
        initHybridQuery({ post } as any);
    });

    beforeEach(async () => {
        await db.userActivity.clear();
        post.mockReset();
    });

    it("queryLocal reads the routed table", async () => {
        await db.userActivity.bulkPut([liked("p1", 1), liked("p2", 2)] as any);

        const rows = await queryLocal({
            selector: { type: DocType.UserActivity },
            $sort: [{ updatedTimeUtc: "desc" }],
        });

        expect(rows.map((r) => r._id)).toEqual(["liked:p2", "liked:p1"]);
    });

    it("a live query follows writes and tombstones without calling the API", async () => {
        await db.userActivity.put(liked("p1", 1) as any);

        const scope = effectScope();
        const q = scope.run(
            () =>
                new HybridQuery(
                    { selector: { type: DocType.UserActivity, deleted: { $exists: false } } },
                    { live: true },
                ),
        )!;

        await waitForExpect(() => expect(q.output.value.map((r) => r._id)).toEqual(["liked:p1"]));

        await db.userActivity.put(liked("p2", 2) as any);
        await waitForExpect(() => expect(q.output.value).toHaveLength(2));

        await db.userActivity.put({ ...(liked("p1", 3) as any), deleted: true });
        await waitForExpect(() => expect(q.output.value.map((r) => r._id)).toEqual(["liked:p2"]));

        expect(post).not.toHaveBeenCalled();
        scope.stop();
    });
});
