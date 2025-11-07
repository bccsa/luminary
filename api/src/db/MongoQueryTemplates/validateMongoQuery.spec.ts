import { validateMongoQuery } from "./validateMongoQuery";

describe("verifyMongoQuery", () => {
    const validBaseQuery = () => ({
        identifier: "sync-language",
        selector: {
            updatedTimeUtc: { $lt: Date.now() - 1000 },
            type: "post",
            memberOf: {
                $elemMatch: {
                    $in: ["group-public-content", "group-private-content"],
                },
            },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        execution_stats: true,
        use_index: "sync-language-index",
    });

    it("passes for a valid query matching the sync template", async () => {
        const q = validBaseQuery();
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(true);
        expect(res.error).toBe("");
    });

    it("fails when identifier is missing", async () => {
        const q: any = validBaseQuery();
        delete q.identifier;
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Missing or invalid 'identifier'/);
    });

    it("fails when template for identifier does not exist", async () => {
        const q: any = validBaseQuery();
        q.identifier = "does-not-exist";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Template not found/);
    });

    it("fails when extra fields are present in query", async () => {
        const q: any = validBaseQuery();
        // Add extra fields that are not in the template to prevent data mining
        q.selector.parentType = "post";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Extra key 'parentType' found in object/);
    });

    it("fails when extra top-level fields are present", async () => {
        const q: any = validBaseQuery();
        q.cms = false; // Not in template
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Extra key 'cms' found in object/);
    });

    it("fails when required field is missing", async () => {
        const q: any = validBaseQuery();
        delete q.selector.type;
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Missing key 'type'/);
    });

    it("fails when type is not a string", async () => {
        const q: any = validBaseQuery();
        q.selector.type = { $in: ["post", "tag"] }; // Should be a string, not an object
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when limit is not a positive number", async () => {
        const q: any = validBaseQuery();
        q.limit = -1;
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Expected 100, got -1/);
    });

    it("fails when sort array has invalid structure", async () => {
        const q: any = validBaseQuery();
        q.sort = [{ updatedTimeUtc: "invalid" }]; // Should be "asc" or "desc"
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Expected "desc", got "invalid"/);
    });

    it("fails when primitive values are not an exact match for limit", async () => {
        const q: any = validBaseQuery();
        q.limit = 50; // Template expects exactly 100
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Expected 100, got 50/);
    });

    it("fails when primitive values are not an exact match for use_index", async () => {
        const q: any = validBaseQuery();
        q.use_index = "different-index"; // Template expects exactly "sync-language-index"
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Expected "sync-language-index", got "different-index"/);
    });

    it("fails when sort array structure does not match exactly", async () => {
        const q: any = validBaseQuery();
        q.sort = [{ updatedTimeUtc: "asc" }]; // Template expects "desc"
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Expected "desc", got "asc"/);
    });

    it("validates that all primitive values in sync-language-index.js must match exactly", async () => {
        // Test that limit must be exactly 100
        const q1 = validBaseQuery();
        q1.limit = 99;
        const res1 = validateMongoQuery(q1 as any);
        expect(res1.valid).toBe(false);
        expect(res1.error).toMatch(/Expected 100, got 99/);

        // Test that use_index must be exactly "sync-language-index"
        const q2 = validBaseQuery();
        q2.use_index = "sync-other";
        const res2 = validateMongoQuery(q2 as any);
        expect(res2.valid).toBe(false);
        expect(res2.error).toMatch(/Expected "sync-language-index", got "sync-other"/);

        // Test that sort field name must match exactly
        const q3 = validBaseQuery();
        (q3 as any).sort = [{ createdTimeUtc: "desc" }]; // Wrong field name
        const res3 = validateMongoQuery(q3 as any);
        expect(res3.valid).toBe(false);
        expect(res3.error).toMatch(/Missing key 'updatedTimeUtc'/);
    });
});
