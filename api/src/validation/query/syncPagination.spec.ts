import { applySyncPagination, syncPaginationError } from "./syncPagination";
import { validateQuery } from "./validateQuery";

const query = () => ({
    selector: { type: "post", updatedTimeUtc: { $gte: 0, $lte: 2000 } },
    limit: 2,
    sort: [{ updatedTimeUtc: "desc" }, { _id: "desc" }],
    use_index: "sync-post-cursor-v1-index",
    syncPagination: { version: 1, after: { updatedTimeUtc: 1000, id: "tie-b" } },
});

describe("stable sync pagination", () => {
    it("keeps legacy requests untouched", () => {
        const legacy = { selector: { type: "post" }, limit: 100 };
        expect(applySyncPagination(legacy)).toBe(legacy);
        expect(validateQuery(legacy).valid).toBe(true);
    });

    it("validates registered stable indexes and an optional first-page cursor", () => {
        expect(validateQuery(query())).toEqual({ valid: true, error: "" });
        const first = { ...query(), syncPagination: { version: 1 } };
        expect(validateQuery(first).valid).toBe(true);
        expect(applySyncPagination(first)).not.toHaveProperty("syncPagination");
    });

    it("ANDs the exclusive boundary without replacing an existing language fallback", () => {
        const input = {
            ...query(),
            selector: {
                ...query().selector,
                $or: [{ language: "en" }, { availableTranslations: { $exists: false } }],
                $and: [{ parentType: "post" }],
            },
        };
        const snapshot = JSON.stringify(input);
        const result = applySyncPagination(input);
        expect(result.selector.$or).toEqual(input.selector.$or);
        expect(result.selector.$and).toEqual([
            { parentType: "post" },
            {
                $or: [
                    { updatedTimeUtc: { $lt: 1000 } },
                    { updatedTimeUtc: 1000, _id: { $lt: "tie-b" } },
                ],
            },
        ]);
        expect(result).not.toHaveProperty("syncPagination");
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("translates only an authenticated owner's client UUID boundary", () => {
        const id = "370e4dc1-5ac3-5023-8c69-b2a010aabefe";
        const input = {
            ...query(),
            selector: { ...query().selector, type: "liked" },
            use_index: "sync-liked-cursor-v1-index",
            syncPagination: { version: 1, after: { updatedTimeUtc: 1000, id } },
        };
        const result = applySyncPagination(input, "owner-one") as any;
        expect(result.selector.$and[0].$or[1]._id).toEqual({ $lt: `owner-one:${id}` });
        expect(() =>
            applySyncPagination(
                {
                    ...input,
                    syncPagination: {
                        version: 1,
                        after: { updatedTimeUtc: 1000, id: `other-owner:${id}` },
                    },
                },
                "owner-one",
            ),
        ).toThrow("client UUID");
        expect(() => applySyncPagination(query(), "owner-one")).toThrow("client UUID");
    });

    it.each([
        null,
        [],
        { version: 2 },
        { version: 1, bookmark: "raw" },
        { version: 1, after: null },
        { version: 1, after: [] },
        { version: 1, after: { updatedTimeUtc: -1, id: "a" } },
        { version: 1, after: { updatedTimeUtc: 3000, id: "a" } },
        { version: 1, after: { updatedTimeUtc: Infinity, id: "a" } },
        { version: 1, after: { updatedTimeUtc: 1.5, id: "a" } },
        { version: 1, after: { updatedTimeUtc: 1000, id: "" } },
        { version: 1, after: { updatedTimeUtc: 1000, id: "a", owner: "forged" } },
    ])("rejects malformed continuation %j", (syncPagination) => {
        const input = { ...query(), syncPagination };
        expect(validateQuery(input).valid).toBe(false);
        expect(() => applySyncPagination(input)).toThrow();
    });

    it.each([
        { sort: [{ updatedTimeUtc: "desc" }] },
        { sort: [{ updatedTimeUtc: "desc" }, { _id: "asc" }] },
        { use_index: "sync-post-index" },
        { use_index: "sync-liked-cursor-v1-index" },
        { limit: 1.5 },
        { limit: 501 },
        { selector: { type: "post", updatedTimeUtc: { $lte: 2000 } } },
    ])("rejects an incompatible query shape %j", (changes) => {
        expect(validateQuery({ ...query(), ...changes }).valid).toBe(false);
    });

    it("does not change validation of legacy non-sync sorts", () => {
        expect(syncPaginationError({ sort: [{ title: "asc" }] })).toBeUndefined();
    });
    it("retains the existing shared-document id contract", () => {
        const id = "legacy-" + "x".repeat(1024);
        const input = {
            ...query(),
            syncPagination: { version: 1, after: { updatedTimeUtc: 1000, id } },
        };
        expect(validateQuery(input).valid).toBe(true);
        expect(applySyncPagination(input)).not.toHaveProperty("syncPagination");
    });
});
