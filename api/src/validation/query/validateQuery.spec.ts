import {
    validateQuery,
    MAX_SELECTOR_DEPTH,
    MAX_SELECTOR_CLAUSES,
    DEFAULT_MAX_LIMIT,
} from "./validateQuery";

describe("validateQuery", () => {
    // A real sync-client payload (shared/src/api/sync/syncBatch.ts).
    const validSyncQuery = () => ({
        identifier: "sync",
        selector: {
            updatedTimeUtc: { $lte: 2000, $gte: 1000 },
            type: "post",
            memberOf: {
                $elemMatch: { $in: ["group-public-content", "group-private-content"] },
            },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-post-index",
    });

    // A real hybridQuery-client payload (shared/src/util/hybridQuery/HybridQuery.ts).
    const validHybridQuery = () => ({
        identifier: "hybridQuery",
        selector: {
            type: "content",
            parentType: "post",
            language: { $in: ["lang-eng"] },
            memberOf: { $elemMatch: { $in: ["group-public-content"] } },
        },
        limit: 50,
    });

    describe("wire compatibility (deployed clients must keep validating)", () => {
        it("accepts a real sync payload", () => {
            const res = validateQuery(validSyncQuery());
            expect(res).toEqual({ valid: true, error: "" });
        });

        it("accepts a real hybridQuery payload", () => {
            const res = validateQuery(validHybridQuery());
            expect(res).toEqual({ valid: true, error: "" });
        });

        it("accepts the optional sync fields (parentType, language, docType, publishDate, includeExpired)", () => {
            const q: any = validSyncQuery();
            q.selector.parentType = "post";
            q.selector.language = { $in: ["lang-eng", "lang-fra"] };
            q.selector.publishDate = { $gte: 1000, $lte: 5000 };
            q.includeExpired = true;
            q.cms = false;
            expect(validateQuery(q).valid).toBe(true);
        });

        it("accepts DeleteCmd sync (docType field present)", () => {
            const q: any = validSyncQuery();
            q.selector.type = "deleteCmd";
            q.selector.docType = "post";
            q.use_index = "sync-post-deleteCmd-index";
            expect(validateQuery(q).valid).toBe(true);
        });
    });

    describe("identifier (observability label only)", () => {
        it("accepts a query with no identifier", () => {
            const q: any = validHybridQuery();
            delete q.identifier;
            expect(validateQuery(q).valid).toBe(true);
        });

        it("accepts an unknown identifier value (not validated against a set)", () => {
            const q: any = validHybridQuery();
            q.identifier = "something-new";
            expect(validateQuery(q).valid).toBe(true);
        });

        it("rejects a non-string identifier", () => {
            const q: any = validHybridQuery();
            q.identifier = 123;
            const res = validateQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/'identifier' must be a string/);
        });
    });

    describe("never mutates the input", () => {
        it("leaves the query object byte-for-byte unchanged (incl. identifier)", () => {
            const q = validSyncQuery();
            const before = JSON.parse(JSON.stringify(q));
            validateQuery(q);
            expect(q).toEqual(before);
            expect((q as any).identifier).toBe("sync");
        });
    });

    describe("top-level shape", () => {
        it("rejects a non-object body", () => {
            expect(validateQuery(null as any).valid).toBe(false);
            expect(validateQuery([] as any).valid).toBe(false);
            expect(validateQuery("x" as any).valid).toBe(false);
        });

        it("requires a selector object", () => {
            const q: any = validHybridQuery();
            delete q.selector;
            expect(validateQuery(q).error).toMatch(/'selector' object is required/);
        });

        it("rejects a non-object / array selector", () => {
            const q1: any = validHybridQuery();
            q1.selector = "nope";
            expect(validateQuery(q1).valid).toBe(false);
            const q2: any = validHybridQuery();
            q2.selector = [];
            expect(validateQuery(q2).valid).toBe(false);
        });

        it("rejects unknown top-level keys", () => {
            const q: any = validHybridQuery();
            q.somethingElse = "x";
            const res = validateQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Unexpected top-level key 'somethingElse'/);
        });

        it("rejects a non-positive / non-number limit", () => {
            const q1: any = validHybridQuery();
            q1.limit = 0;
            expect(validateQuery(q1).error).toMatch(/'limit' must be a positive number/);
            const q2: any = validHybridQuery();
            q2.limit = -5;
            expect(validateQuery(q2).valid).toBe(false);
            const q3: any = validHybridQuery();
            q3.limit = "100";
            expect(validateQuery(q3).valid).toBe(false);
        });

        it("rejects a non-array sort", () => {
            const q: any = validHybridQuery();
            q.sort = { updatedTimeUtc: "desc" };
            expect(validateQuery(q).error).toMatch(/'sort' must be an array/);
        });

        it("rejects non-boolean cms / includeExpired", () => {
            const q1: any = validHybridQuery();
            q1.cms = "true";
            expect(validateQuery(q1).error).toMatch(/'cms' must be a boolean/);
            const q2: any = validHybridQuery();
            q2.includeExpired = 1;
            expect(validateQuery(q2).error).toMatch(/'includeExpired' must be a boolean/);
        });
    });

    describe("limit cap", () => {
        it("rejects a limit above the default maximum", () => {
            const q: any = validHybridQuery();
            q.limit = DEFAULT_MAX_LIMIT + 1;
            const res = validateQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/limit exceeds maximum \(500\)/);
        });

        it("accepts a limit at the maximum", () => {
            const q: any = validHybridQuery();
            q.limit = DEFAULT_MAX_LIMIT;
            expect(validateQuery(q).valid).toBe(true);
        });

        it("honors a custom maxLimit option", () => {
            const q: any = validHybridQuery();
            q.limit = 100;
            const res = validateQuery(q, { maxLimit: 50 });
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/limit exceeds maximum \(50\)/);
        });
    });

    describe("use_index (registry membership)", () => {
        const indexNames = new Set(["sync-post-index", "content-publishDate-index"]);

        it("accepts a known index name", () => {
            const q: any = validHybridQuery();
            q.use_index = "content-publishDate-index";
            expect(validateQuery(q, { indexNames }).valid).toBe(true);
        });

        it("rejects an unknown index name", () => {
            const q: any = validHybridQuery();
            q.use_index = "no-such-index";
            const res = validateQuery(q, { indexNames });
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Unknown index 'no-such-index'/);
        });

        it("rejects a non-string use_index", () => {
            const q: any = validHybridQuery();
            q.use_index = 123;
            expect(validateQuery(q, { indexNames }).error).toMatch(/'use_index' must be a string/);
        });

        it("accepts an absent use_index", () => {
            const q: any = validHybridQuery();
            delete q.use_index;
            expect(validateQuery(q, { indexNames }).valid).toBe(true);
        });
    });

    describe("operator policy", () => {
        it("rejects $regex anywhere in the selector", () => {
            const q: any = validHybridQuery();
            q.selector.title = { $regex: "^.*$" };
            expect(validateQuery(q).error).toMatch(/\$regex/);
        });

        it("rejects $where anywhere in the selector", () => {
            const q: any = validHybridQuery();
            q.selector.$where = "function() { return true; }";
            expect(validateQuery(q).error).toMatch(/\$where/);
        });

        it("rejects $regex nested inside $or (proves recursive walk)", () => {
            const q: any = validHybridQuery();
            q.selector.$or = [{ slug: "a" }, { title: { $regex: "x" } }];
            expect(validateQuery(q).error).toMatch(/\$regex/);
        });

        it("rejects $elemMatch on a field outside the allowlist", () => {
            const q: any = validHybridQuery();
            q.selector.slug = { $elemMatch: { $in: ["x"] } };
            expect(validateQuery(q).error).toMatch(/\$elemMatch/);
        });

        it("allows $elemMatch on the allowlisted array fields", () => {
            for (const field of ["memberOf", "availableTranslations", "parentTags", "tags"]) {
                const q: any = validHybridQuery();
                q.selector[field] = { $elemMatch: { $in: ["x"] } };
                expect(validateQuery(q).valid).toBe(true);
            }
        });

        it("allows the hybrid language-priority shape ($not/$or wrapping availableTranslations $elemMatch)", () => {
            const q: any = validHybridQuery();
            q.selector.$or = [
                { language: "lang-eng" },
                { $and: [{ $not: { availableTranslations: { $elemMatch: { $eq: "lang-eng" } } } }] },
            ];
            expect(validateQuery(q).valid).toBe(true);
        });

        // A null member of $in/$nin/$all crashes CouchDB's _find (function_clause / 500).
        it("rejects $in/$nin/$all arrays containing null", () => {
            for (const op of ["$in", "$nin", "$all"]) {
                const q: any = validHybridQuery();
                q.selector.parentId = { [op]: ["a", null, "b"] };
                const res = validateQuery(q);
                expect(res.valid).toBe(false);
                expect(res.error).toMatch(
                    new RegExp(`operator '\\${op}' array must not contain null`),
                );
            }
        });

        it("rejects a $in containing only null (the reported crash shape)", () => {
            const q: any = validHybridQuery();
            q.selector.parentId = { $in: [null] };
            expect(validateQuery(q).error).toMatch(/must not contain null/);
        });

        it("rejects null in a $in nested inside $and/$or (recursive walk)", () => {
            const q: any = validHybridQuery();
            q.selector.$or = [{ slug: "a" }, { parentId: { $in: ["x", null] } }];
            expect(validateQuery(q).error).toMatch(/must not contain null/);
        });

        it("accepts $in/$nin/$all arrays without null (incl. empty)", () => {
            for (const arr of [["a", "b"], []]) {
                const q: any = validHybridQuery();
                q.selector.parentId = { $in: arr };
                expect(validateQuery(q).valid).toBe(true);
            }
        });
    });

    describe("DoS guards", () => {
        it("rejects a selector nested beyond the depth cap", () => {
            const q: any = validHybridQuery();
            // Build $and: [{ $and: [{ $and: [ ... ] }]}] nested past MAX_SELECTOR_DEPTH.
            let node: any = { deepField: "x" };
            for (let i = 0; i < MAX_SELECTOR_DEPTH + 2; i++) node = { $and: [node] };
            q.selector = node;
            const res = validateQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/nesting exceeds maximum depth/);
        });

        it("rejects a selector with too many clauses", () => {
            const q: any = validHybridQuery();
            const branches: any[] = [];
            for (let i = 0; i < MAX_SELECTOR_CLAUSES + 10; i++) branches.push({ ["f" + i]: i });
            q.selector = { $and: branches };
            const res = validateQuery(q);
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/too many clauses/);
        });

        it("does not count scalars inside $in arrays against the clause cap", () => {
            const q: any = validHybridQuery();
            const bigIn: string[] = [];
            for (let i = 0; i < MAX_SELECTOR_CLAUSES + 100; i++) bigIn.push("g" + i);
            q.selector.memberOf = { $elemMatch: { $in: bigIn } };
            expect(validateQuery(q).valid).toBe(true);
        });
    });
});
