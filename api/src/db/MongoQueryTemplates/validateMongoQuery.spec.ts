import { validateMongoQuery } from "./validateMongoQuery";

describe("verifyMongoQuery", () => {
    const validBaseQuery = () => ({
        identifier: "sync",
        selector: {
            updatedTimeUtc: { $lte: Date.now() - 1000, $gte: Date.now() - 2000 },
            type: "post",
            memberOf: {
                $elemMatch: {
                    $in: ["group-public-content", "group-private-content"],
                },
            },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-post-index",
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
        q.selector.unknownField = "invalid";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("passes when optional cms field is present", async () => {
        const q: any = validBaseQuery();
        q.cms = false; // Optional field - should be allowed
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(true);
        expect(res.error).toBe("");
    });

    it("fails when required field is missing", async () => {
        const q: any = validBaseQuery();
        delete q.selector.type;
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when type is not a string", async () => {
        const q: any = validBaseQuery();
        q.selector.type = { $in: ["post", "tag"] }; // Should be a string, not an object
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when attempting to sync user documents", async () => {
        const q: any = validBaseQuery();
        q.selector.type = "user"; // User documents are not allowed to be synced
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when limit is not a positive number", async () => {
        const q: any = validBaseQuery();
        q.limit = -1;
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when sort array has invalid structure", async () => {
        const q: any = validBaseQuery();
        q.sort = [{ updatedTimeUtc: "invalid" }]; // Should be "asc" or "desc"
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("passes when limit is any positive number", async () => {
        const q: any = validBaseQuery();
        q.limit = 50; // Template accepts any positive number
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(true);
        expect(res.error).toBe("");
    });

    it("fails when use_index does not match sync index pattern", async () => {
        const q: any = validBaseQuery();
        q.use_index = "different-index"; // Template expects sync-*-index pattern
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when sort array structure does not match exactly", async () => {
        const q: any = validBaseQuery();
        q.sort = [{ updatedTimeUtc: "asc" }]; // Template expects "desc"
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("validates sync.js template with flexible fields", async () => {
        // Test that limit can be any positive number
        const q1 = validBaseQuery();
        q1.limit = 99;
        const res1 = validateMongoQuery(q1 as any);
        expect(res1.valid).toBe(true);

        // Test that use_index must follow sync-*-index pattern
        const q2 = validBaseQuery();
        q2.use_index = "sync-content-post-index";
        const res2 = validateMongoQuery(q2 as any);
        expect(res2.valid).toBe(true);

        // Test that sort field name must match exactly
        const q3 = validBaseQuery();
        (q3 as any).sort = [{ createdTimeUtc: "desc" }]; // Wrong field name
        const res3 = validateMongoQuery(q3 as any);
        expect(res3.valid).toBe(false);
        expect(res3.error).toMatch(/Function validation failed/);
    });

    it("blocks path traversal attacks with ../", async () => {
        const q: any = validBaseQuery();
        q.identifier = "../../../etc/passwd";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        // Should either fail to find template or block path separators
        expect(res.error).toMatch(/Template not found|path separators not allowed/);
    });

    it("blocks path traversal attacks with encoded characters", async () => {
        const q: any = validBaseQuery();
        q.identifier = "..%2F..%2Fetc%2Fpasswd";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Template not found|path separators not allowed/);
    });

    it("blocks absolute paths", async () => {
        const q: any = validBaseQuery();
        q.identifier = "/etc/passwd";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Template not found|path separators not allowed/);
    });

    it("blocks Windows-style path traversal", async () => {
        const q: any = validBaseQuery();
        q.identifier = "..\\..\\windows\\system32\\config\\sam";
        const res = validateMongoQuery(q as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Template not found|path separators not allowed/);
    });

    it("caches successfully validated templates for performance", async () => {
        // First call - template should be loaded from file
        const q1 = validBaseQuery();
        const res1 = validateMongoQuery(q1 as any);
        expect(res1.valid).toBe(true);

        // Second call with same identifier - should use cached template
        const q2 = validBaseQuery();
        const res2 = validateMongoQuery(q2 as any);
        expect(res2.valid).toBe(true);

        // Verify validation still works correctly with cached template
        const q3 = validBaseQuery();
        q3.limit = -5; // Invalid limit (must be positive)
        const res3 = validateMongoQuery(q3 as any);
        expect(res3.valid).toBe(false);
        expect(res3.error).toMatch(/Function validation failed/);
    });
});
