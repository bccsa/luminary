import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";
import { useContentQueryWithState } from "./useContentQueryWithState";

afterEach(async () => {
    await db.docs.clear();
});

describe("useContentQueryWithState", () => {
    it("settles isFetching to false even when the selector short-circuits to provably empty", async () => {
        const { output, isFetching } = useContentQueryWithState(() => [{ _id: { $in: [] } }]);

        await waitForExpect(() => {
            expect(isFetching.value).toBe(false);
        });
        expect(output.value).toEqual([]);
    });
});
