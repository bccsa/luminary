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

    it("fails when identifier is a number", async () => {
        const q: any = { identifier: 123 };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Missing or invalid 'identifier'/);
    });

    it("passes with optional parentType field in sync template", () => {
        const q: any = validBaseQuery();
        q.selector.parentType = "post";
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("passes with optional language field in sync template", () => {
        const q: any = validBaseQuery();
        q.selector.language = { $in: ["lang-eng", "lang-fra"] };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("passes with optional docType field in sync template", () => {
        const q: any = validBaseQuery();
        q.selector.docType = "post";
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("passes when sync template omits publishDate (backwards compatible)", () => {
        const q: any = validBaseQuery();
        // Sanity: the base query has no publishDate.
        expect(q.selector.publishDate).toBeUndefined();
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("passes with optional publishDate $gte in sync template", () => {
        const q: any = validBaseQuery();
        q.selector.publishDate = { $gte: 1000 };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("passes with optional publishDate $lte in sync template", () => {
        const q: any = validBaseQuery();
        q.selector.publishDate = { $lte: 5000 };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("passes with optional publishDate $gte and $lte in sync template", () => {
        const q: any = validBaseQuery();
        q.selector.publishDate = { $gte: 1000, $lte: 5000 };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(true);
    });

    it("fails when publishDate has extra (non-$gte/$lte) keys", () => {
        const q: any = validBaseQuery();
        // Use $lt (a real operator the global policy doesn't block) so this test
        // exercises the sync template's publishDate key restriction, not the
        // global operator policy.
        q.selector.publishDate = { $gte: 1000, $lt: 5000 };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when publishDate $gte is not a number", () => {
        const q: any = validBaseQuery();
        q.selector.publishDate = { $gte: "1000" };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when publishDate $lte is not a number", () => {
        const q: any = validBaseQuery();
        q.selector.publishDate = { $lte: "5000" };
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    it("fails when publishDate is not an object", () => {
        const q: any = validBaseQuery();
        q.selector.publishDate = 1234;
        const res = validateMongoQuery(q);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Function validation failed/);
    });

    describe("hybridQuery template", () => {
        const validHybridQuery = () => ({
            identifier: "hybridQuery",
            selector: {
                type: "content",
                parentType: "post",
                language: { $in: ["lang-eng"] },
                memberOf: { $elemMatch: { $in: ["group-public-content"] } },
            },
        });

        it("passes for a minimal hybridQuery", () => {
            const res = validateMongoQuery(validHybridQuery() as any);
            expect(res.valid).toBe(true);
            expect(res.error).toBe("");
        });

        it("passes with optional limit, sort, cms fields", () => {
            const q: any = validHybridQuery();
            q.limit = 50;
            q.sort = [{ updatedTimeUtc: "desc" }];
            q.cms = false;
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(true);
        });

        it("accepts arbitrary selector fields (permission injection happens server-side)", () => {
            const q: any = validHybridQuery();
            q.selector.status = "published";
            q.selector.slug = "some-slug";
            q.selector.publishDate = { $gte: 1000, $lte: 5000 };
            q.selector.expiryDate = { $gt: 0 };
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(true);
        });

        it("fails when selector is missing", () => {
            const q: any = validHybridQuery();
            delete q.selector;
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails when selector is not an object", () => {
            const q: any = validHybridQuery();
            q.selector = "not-an-object";
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails when selector is an array", () => {
            const q: any = validHybridQuery();
            q.selector = [];
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails when an unknown top-level key is present", () => {
            const q: any = validHybridQuery();
            q.somethingElse = "x"; // not in the top-level allowlist
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("passes use_index when it matches the allowlist", () => {
            const q: any = validHybridQuery();
            q.use_index = "content-publishDate-index";
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(true);
        });

        it("fails use_index when it doesn't match the allowlist", () => {
            const q: any = validHybridQuery();
            q.use_index = "some-other-index";
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails use_index when it is not a string", () => {
            const q: any = validHybridQuery();
            q.use_index = 123;
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails when limit is not a positive number", () => {
            const q: any = validHybridQuery();
            q.limit = 0;
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails when sort is not an array", () => {
            const q: any = validHybridQuery();
            q.sort = { updatedTimeUtc: "desc" }; // must be array
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });

        it("fails when cms is not a boolean", () => {
            const q: any = validHybridQuery();
            q.cms = "true";
            const res = validateMongoQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Function validation failed/);
        });
    });

    describe("global query policy (all identifiers)", () => {
        const validHybridQuery = () => ({
            identifier: "hybridQuery",
            selector: {
                type: "content",
                parentType: "post",
                memberOf: { $elemMatch: { $in: ["group-public-content"] } },
            },
        });

        describe("limit cap", () => {
            it("rejects a limit above the default maximum (500)", () => {
                const q: any = validHybridQuery();
                q.limit = 501;
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/limit exceeds maximum \(500\)/);
            });

            it("accepts a limit at the maximum", () => {
                const q: any = validHybridQuery();
                q.limit = 500;
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(true);
            });

            it("honors a custom maxLimit option", () => {
                const q: any = validHybridQuery();
                q.limit = 100;
                const res = validateMongoQuery(q, { maxLimit: 50 });
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/limit exceeds maximum \(50\)/);
            });

            it("applies the cap to the sync identifier too", () => {
                const q: any = validBaseQuery();
                q.limit = 100000;
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/limit exceeds maximum/);
            });
        });

        describe("operator policy", () => {
            it("rejects $regex anywhere in the selector", () => {
                const q: any = validHybridQuery();
                q.selector.title = { $regex: "^.*$" };
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/\$regex/);
            });

            it("rejects $where anywhere in the selector", () => {
                const q: any = validHybridQuery();
                q.selector.$where = "function() { return true; }";
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/\$where/);
            });

            it("rejects $regex nested inside $and / $or (proves recursive walk)", () => {
                const q: any = validHybridQuery();
                q.selector.$or = [{ slug: "a" }, { title: { $regex: "x" } }];
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/\$regex/);
            });

            it("rejects $elemMatch on a field outside the allowlist", () => {
                const q: any = validHybridQuery();
                q.selector.slug = { $elemMatch: { $in: ["x"] } };
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(/\$elemMatch/);
            });

            it("allows $elemMatch on parentTags and tags (content category filters)", () => {
                const q1: any = validHybridQuery();
                q1.selector.parentTags = { $elemMatch: { $in: ["tag1"] } };
                expect(validateMongoQuery(q1).valid).toBe(true);

                const q2: any = validHybridQuery();
                q2.selector.tags = { $elemMatch: { $in: ["tag1"] } };
                expect(validateMongoQuery(q2).valid).toBe(true);
            });

            it("allows $elemMatch on memberOf (sync + hybridQuery shape)", () => {
                const res = validateMongoQuery(validHybridQuery() as any);
                expect(res.valid).toBe(true);
                const syncRes = validateMongoQuery(validBaseQuery() as any);
                expect(syncRes.valid).toBe(true);
            });

            it("allows $elemMatch on availableTranslations", () => {
                const q: any = validHybridQuery();
                q.selector.availableTranslations = { $elemMatch: { $eq: "lang-eng" } };
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(true);
            });

            it("allows the hybrid query language-priority shape ($not/$or wrapping availableTranslations $elemMatch)", () => {
                const q: any = validHybridQuery();
                q.selector.$or = [
                    { language: "lang-eng" },
                    {
                        $and: [
                            { $not: { availableTranslations: { $elemMatch: { $eq: "lang-eng" } } } },
                        ],
                    },
                ];
                const res = validateMongoQuery(q);
                expect(res.valid).toBe(true);
            });
        });
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
