import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { FtsSearchService } from "./ftsSearch.service";
import { DbService, FtsCandidateRow, FtsCandidateValue } from "../db/db.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger } from "winston";
import { AclPermission, DocType, PublishStatus } from "../enums";
import { FtsSearchReqDto } from "../dto/FtsSearchReqDto";
import * as permissions from "../permissions/permissions.service";

describe("FtsSearchService", () => {
    let service: FtsSearchService;
    let dbService: {
        executeFindQuery: jest.Mock;
        on: jest.Mock;
        ftsCorpusStats: jest.Mock;
        ftsTrigramDf: jest.Mock;
        ftsTrigramCandidates: jest.Mock;
        ftsAuxTrigramDf: jest.Mock;
        ftsAuxTrigramCandidates: jest.Mock;
        getDocs: jest.Mock;
    };
    let logger: Logger;

    const ENG = "lang-eng";
    const POST_GROUP = "group-post";
    const LANG_GROUP = "group-lang";

    const mockUser = { accessMap: {} } as any;

    // helper to build the embedded view value tuple
    function value(
        partial: Partial<{
            tf: number;
            parentType: DocType;
            status: PublishStatus;
            publishDate: number | null;
            expiryDate: number | null;
            language: string;
            memberOf: string[];
            parentTags: string[];
            updatedTimeUtc: number | null;
            title: string | null;
            author: string | null;
        }> = {},
    ): FtsCandidateValue {
        return [
            partial.tf ?? 5,
            partial.parentType ?? DocType.Post,
            partial.status ?? PublishStatus.Published,
            partial.publishDate ?? 1000,
            partial.expiryDate ?? null,
            partial.language ?? ENG,
            partial.memberOf ?? [POST_GROUP],
            partial.parentTags ?? [],
            partial.updatedTimeUtc ?? 1000,
            partial.title ?? null,
            partial.author ?? null,
        ];
    }

    function row(docId: string, trigram: string, v: FtsCandidateValue): FtsCandidateRow {
        return { docId, trigram, value: v };
    }

    function makeReq(partial: Partial<FtsSearchReqDto> = {}): FtsSearchReqDto {
        return { apiVersion: "1", queryString: "garden", ...partial } as FtsSearchReqDto;
    }

    beforeEach(async () => {
        dbService = {
            executeFindQuery: jest.fn().mockResolvedValue({ docs: [] }),
            on: jest.fn(),
            ftsCorpusStats: jest.fn().mockResolvedValue({ docCount: 100, totalTokenCount: 1000 }),
            ftsTrigramDf: jest
                .fn()
                .mockResolvedValue(new Map([["gar", 3], ["ard", 3], ["rde", 3], ["den", 3]])),
            ftsTrigramCandidates: jest.fn().mockResolvedValue([]),
            ftsAuxTrigramDf: jest
                .fn()
                .mockImplementation((_view: string, trigrams: string[]) =>
                    Promise.resolve(new Map(trigrams.map((t) => [t, 3]))),
                ),
            ftsAuxTrigramCandidates: jest.fn().mockResolvedValue([]),
            getDocs: jest.fn().mockResolvedValue({ docs: [] }),
        } as any;
        logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;

        // Default: user can View Post (POST_GROUP) and Language (LANG_GROUP)
        jest.spyOn(permissions.PermissionSystem, "accessMapToGroups").mockReturnValue({
            [DocType.Post]: [POST_GROUP],
            [DocType.Language]: [LANG_GROUP],
        } as any);

        const moduleRef = await Test.createTestingModule({
            providers: [
                FtsSearchService,
                { provide: DbService, useValue: dbService },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
            ],
        }).compile();

        service = moduleRef.get(FtsSearchService);

        // wait for the constructor language-load to settle, then seed the cache
        await new Promise((resolve) => setImmediate(resolve));
        (service as any).languages = [{ _id: ENG, type: DocType.Language, memberOf: [LANG_GROUP] }];
    });

    afterEach(() => jest.restoreAllMocks());

    it("returns [] when the query produces no trigrams", async () => {
        const res = await service.search(makeReq({ queryString: "a b" }), mockUser);
        expect(res).toEqual([]);
        expect(dbService.ftsTrigramCandidates).not.toHaveBeenCalled();
    });

    it("throws 403 when the user has no view groups for the requested types", async () => {
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce({} as any);
        await expect(service.search(makeReq(), mockUser)).rejects.toEqual(
            new HttpException("Forbidden", HttpStatus.FORBIDDEN),
        );
    });

    it("rejects a status filter unless cms=true", async () => {
        await expect(
            service.search(makeReq({ status: PublishStatus.Draft }), mockUser),
        ).rejects.toEqual(
            new HttpException(
                "'status' filter is only available with cms=true",
                HttpStatus.BAD_REQUEST,
            ),
        );
    });

    it("excludes docs in groups the user cannot view", async () => {
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("doc-allowed", "gar", value()),
            row("doc-denied", "gar", value({ memberOf: ["other-group"] })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [{ _id: "doc-allowed", title: "garden", ftsTokenCount: 10 }],
        });

        const res = await service.search(makeReq(), mockUser);
        const ids = res.map((r) => r.docId);
        expect(ids).toContain("doc-allowed");
        expect(ids).not.toContain("doc-denied");
        // only permitted ids are fetched
        expect(dbService.getDocs).toHaveBeenCalledWith(["doc-allowed"], [DocType.Content]);
    });

    it("excludes draft, scheduled and expired docs on the non-cms path", async () => {
        const now = Date.now();
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("ok", "gar", value({ publishDate: now - 1000 })),
            row("draft", "gar", value({ status: PublishStatus.Draft })),
            row("scheduled", "gar", value({ publishDate: now + 100000 })),
            row("expired", "gar", value({ expiryDate: now - 1 })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [{ _id: "ok", title: "garden", ftsTokenCount: 10 }],
        });

        const res = await service.search(makeReq(), mockUser);
        expect(res.map((r) => r.docId)).toEqual(["ok"]);
    });

    it("includes drafts on the cms path", async () => {
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("draft", "gar", value({ status: PublishStatus.Draft, language: "other-lang" })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [{ _id: "draft", title: "garden", ftsTokenCount: 10 }],
        });

        const res = await service.search(makeReq({ cms: true }), mockUser);
        expect(res.map((r) => r.docId)).toEqual(["draft"]);
    });

    it("applies the tags filter (parentTags intersect)", async () => {
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("tagged", "gar", value({ parentTags: ["t1", "t2"] })),
            row("untagged", "gar", value({ parentTags: ["t9"] })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [{ _id: "tagged", title: "garden", ftsTokenCount: 10 }],
        });

        const res = await service.search(makeReq({ tags: ["t2"] }), mockUser);
        expect(res.map((r) => r.docId)).toEqual(["tagged"]);
    });

    it("applies the publishDate range filter", async () => {
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("inrange", "gar", value({ publishDate: 500 })),
            row("tooearly", "gar", value({ publishDate: 100 })),
            row("toolate", "gar", value({ publishDate: 900 })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [{ _id: "inrange", title: "garden", ftsTokenCount: 10 }],
        });

        const res = await service.search(
            makeReq({ publishedAfter: 400, publishedBefore: 600 }),
            mockUser,
        );
        expect(res.map((r) => r.docId)).toEqual(["inrange"]);
    });

    it("ranks by score and returns trimmed docs without fts index fields", async () => {
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("low", "gar", value({ tf: 1 })),
            row("high", "gar", value({ tf: 50 })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [
                { _id: "low", title: "x", ftsTokenCount: 10, fts: ["gar:1"] },
                { _id: "high", title: "garden", ftsTokenCount: 10, fts: ["gar:50"] },
            ],
        });

        const res = await service.search(makeReq(), mockUser);
        expect(res[0].docId).toBe("high");
        expect(res[1].docId).toBe("low");
        // fts index fields stripped from returned docs
        for (const r of res) {
            expect((r.doc as any).fts).toBeUndefined();
            expect((r.doc as any).ftsTokenCount).toBeUndefined();
        }
    });

    it("prunes high-df trigrams, keeping the lowest-df within the budget", async () => {
        // Large corpus so the high-df trigrams still pass the maxTrigramDocPercent (50%)
        // filter but their summed df exceeds the candidate-row budget (3000).
        dbService.ftsCorpusStats.mockResolvedValue({ docCount: 10000, totalTokenCount: 100000 });
        dbService.ftsTrigramDf.mockResolvedValue(
            new Map([
                ["gar", 500],
                ["ard", 800],
                ["rde", 1200],
                ["den", 4000], // highest df — pushes the running budget over 3000, so dropped
            ]),
        );
        dbService.ftsTrigramCandidates.mockResolvedValue([]); // empty → search returns []

        await service.search(makeReq({ queryString: "garden" }), mockUser);

        // Only the three lowest-df trigrams are fetched (sorted rarest-first); "den" is pruned.
        expect(dbService.ftsTrigramCandidates).toHaveBeenCalledWith(["gar", "ard", "rde"]);
    });

    it("does not fetch candidates when the rarest trigram exceeds the row budget", async () => {
        dbService.ftsCorpusStats.mockResolvedValue({ docCount: 10000, totalTokenCount: 100000 });
        dbService.ftsTrigramDf.mockResolvedValue(
            new Map([
                ["gar", 4000],
                ["ard", 4100],
                ["rde", 4200],
                ["den", 4300],
            ]),
        );

        const res = await service.search(makeReq({ queryString: "garden" }), mockUser);

        expect(res).toEqual([]);
        expect(dbService.ftsTrigramCandidates).not.toHaveBeenCalled();
    });

    it("returns private cost stats from searchWithStats", async () => {
        dbService.ftsTrigramCandidates.mockResolvedValue([
            row("d1", "gar", value({ tf: 1 })),
            row("d2", "ard", value({ tf: 2 })),
        ]);
        dbService.getDocs.mockResolvedValue({
            docs: [
                { _id: "d1", title: "garden", ftsTokenCount: 10 },
                { _id: "d2", title: "garden bed", ftsTokenCount: 10 },
            ],
        });

        const { results, stats } = await service.searchWithStats(makeReq(), mockUser);

        expect(results).toHaveLength(2);
        expect(stats).toMatchObject({
            trigrams: 4,
            keptTrigrams: 4,
            estimatedCandidateRows: 12,
            candidateRows: 2,
            survivors: 2,
            topK: 2,
            candidateRowBudget: 3000,
        });
    });

    it("caps the exact-scored set at max(150, offset + limit)", async () => {
        const rows = Array.from({ length: 200 }, (_, i) => row(`d${i}`, "gar", value()));
        dbService.ftsTrigramCandidates.mockResolvedValue(rows);
        dbService.getDocs.mockResolvedValue({ docs: [] });

        // Default page (limit 20) → cap of 150.
        await service.search(makeReq(), mockUser);
        expect(dbService.getDocs.mock.calls[0][0]).toHaveLength(150);

        // Deep page (offset 140 + limit 20 = 160) → cap grows to 160.
        dbService.getDocs.mockClear();
        await service.search(makeReq({ offset: 140, limit: 20 }), mockUser);
        expect(dbService.getDocs.mock.calls[0][0]).toHaveLength(160);
    });

    describe("strict mode (matchAllWords + sort)", () => {
        // Return a minimal body for whatever page ids the strict path fetches.
        const echoDocs = () =>
            dbService.getDocs.mockImplementation((ids: string[]) => ({
                docs: ids.map((id) => ({ _id: id, ftsTokenCount: 10 })),
            }));

        it("keeps only title/author substring matches and orders by the sort field", async () => {
            dbService.ftsTrigramCandidates.mockResolvedValue([
                row("party", "gar", value({ title: "Garden party", updatedTimeUtc: 100 })),
                row("guide", "gar", value({ title: "Gardening guide", updatedTimeUtc: 300 })),
                row("other", "gar", value({ title: "Unrelated", updatedTimeUtc: 200 })),
            ]);
            echoDocs();

            const res = await service.search(
                makeReq({
                    cms: true,
                    matchAllWords: true,
                    sort: { field: "updatedTimeUtc", direction: "desc" },
                }),
                mockUser,
            );
            // "Unrelated" has no "garden" substring → excluded; rest sorted by updatedTimeUtc desc.
            expect(res.map((r) => r.docId)).toEqual(["guide", "party"]);
        });

        it("supports partial (substring) matching", async () => {
            dbService.ftsTrigramCandidates.mockResolvedValue([
                row("x", "gar", value({ title: "Gardening", updatedTimeUtc: 1 })),
            ]);
            echoDocs();

            // Partial term "gard" matches "gardening".
            const res = await service.search(
                makeReq({ queryString: "gard", cms: true, matchAllWords: true }),
                mockUser,
            );
            expect(res.map((r) => r.docId)).toEqual(["x"]);
        });

        it("matches against author as well as title", async () => {
            dbService.ftsTrigramCandidates.mockResolvedValue([
                row("byauthor", "gar", value({ title: "Nothing here", author: "Garden Smith" })),
            ]);
            echoDocs();

            const res = await service.search(
                makeReq({ cms: true, matchAllWords: true }),
                mockUser,
            );
            expect(res.map((r) => r.docId)).toEqual(["byauthor"]);
        });

        it("ANDs across query words", async () => {
            dbService.ftsTrigramCandidates.mockResolvedValue([
                row("both", "gar", value({ title: "Garden meeting notes" })),
                row("oneonly", "gar", value({ title: "Garden party" })),
            ]);
            echoDocs();

            const res = await service.search(
                makeReq({ queryString: "garden meeting", cms: true, matchAllWords: true }),
                mockUser,
            );
            expect(res.map((r) => r.docId)).toEqual(["both"]);
        });

        it("sorts by title ascending, case-insensitive, nulls last (sort without matchAllWords)", async () => {
            dbService.ftsTrigramCandidates.mockResolvedValue([
                row("n", "gar", value({ title: null })),
                row("b", "gar", value({ title: "banana" })),
                row("a", "gar", value({ title: "Apple" })),
            ]);
            echoDocs();

            const res = await service.search(
                makeReq({ cms: true, sort: { field: "title", direction: "asc" } }),
                mockUser,
            );
            expect(res.map((r) => r.docId)).toEqual(["a", "b", "n"]);
        });

        it("rejects an invalid sort field", async () => {
            await expect(
                service.search(
                    makeReq({ sort: { field: "bogus" as any, direction: "asc" } }),
                    mockUser,
                ),
            ).rejects.toEqual(new HttpException("invalid 'sort'", HttpStatus.BAD_REQUEST));
        });
    });

    describe("aux doctypes (User / Redirect strict search)", () => {
        const USER_GROUP = "group-user";
        const REDIRECT_GROUP = "group-redirect";

        // A User aux candidate row: { trigram, docId, value: <named metadata object> }.
        function userRow(
            docId: string,
            trigram: string,
            meta: Partial<{
                memberOf: string[];
                name: string | null;
                email: string | null;
                lastLogin: number | null;
                updatedTimeUtc: number | null;
            }> = {},
        ) {
            return {
                docId,
                trigram,
                value: {
                    memberOf: meta.memberOf ?? [USER_GROUP],
                    name: meta.name ?? null,
                    email: meta.email ?? null,
                    lastLogin: meta.lastLogin ?? null,
                    updatedTimeUtc: meta.updatedTimeUtc ?? 1000,
                },
            };
        }

        const echoUsers = () =>
            dbService.getDocs.mockImplementation((ids: string[]) => ({
                docs: ids.map((id) => ({ _id: id, type: DocType.User })),
            }));

        beforeEach(() => {
            // Default: user can View the User doctype via USER_GROUP.
            (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue({
                [DocType.User]: [USER_GROUP],
            });
        });

        it("substring-ANDs over name + email and reads from the user view", async () => {
            dbService.ftsAuxTrigramCandidates.mockResolvedValue([
                userRow("u-name", "gar", { name: "Gardener Joe" }),
                userRow("u-email", "gar", { name: "Jane", email: "garden@x.com" }),
                userRow("u-miss", "gar", { name: "Unrelated", email: "a@b.com" }),
            ]);
            echoUsers();

            const res = await service.search(
                makeReq({ types: [DocType.User], cms: true, matchAllWords: true }),
                mockUser,
            );
            const ids = res.map((r) => r.docId);
            expect(ids).toEqual(expect.arrayContaining(["u-name", "u-email"]));
            expect(ids).not.toContain("u-miss");
            expect(dbService.ftsAuxTrigramCandidates).toHaveBeenCalledWith(
                "fts-trigram-index-user",
                expect.any(Array),
            );
            expect(dbService.getDocs).toHaveBeenCalledWith(expect.any(Array), [DocType.User]);
            // never touches the Content trigram view/path
            expect(dbService.ftsTrigramCandidates).not.toHaveBeenCalled();
        });

        it("orders the full match set by the requested sort field", async () => {
            dbService.ftsAuxTrigramCandidates.mockResolvedValue([
                userRow("old", "gar", { name: "Garden A", updatedTimeUtc: 100 }),
                userRow("new", "gar", { name: "Garden B", updatedTimeUtc: 300 }),
                userRow("mid", "gar", { name: "Garden C", updatedTimeUtc: 200 }),
            ]);
            echoUsers();

            const res = await service.search(
                makeReq({
                    types: [DocType.User],
                    cms: true,
                    matchAllWords: true,
                    sort: { field: "updatedTimeUtc", direction: "desc" },
                }),
                mockUser,
            );
            expect(res.map((r) => r.docId)).toEqual(["new", "mid", "old"]);
        });

        it("scopes by permission AND the explicit groups filter (memberOf ∩)", async () => {
            dbService.ftsAuxTrigramCandidates.mockResolvedValue([
                userRow("in", "gar", { name: "Garden A", memberOf: [USER_GROUP, "g-extra"] }),
                userRow("denied", "gar", { name: "Garden B", memberOf: ["other-group"] }),
                userRow("filtered", "gar", { name: "Garden C", memberOf: [USER_GROUP] }),
            ]);
            echoUsers();

            const res = await service.search(
                makeReq({
                    types: [DocType.User],
                    cms: true,
                    matchAllWords: true,
                    groups: ["g-extra"],
                }),
                mockUser,
            );
            // "denied": no View group; "filtered": permitted but outside the groups filter.
            expect(res.map((r) => r.docId)).toEqual(["in"]);
        });

        it("throws 403 when the user has no View groups for the doctype", async () => {
            (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue({});
            await expect(
                service.search(makeReq({ types: [DocType.User], matchAllWords: true }), mockUser),
            ).rejects.toEqual(new HttpException("Forbidden", HttpStatus.FORBIDDEN));
        });

        it("rejects a sort field not allowed for the doctype", async () => {
            await expect(
                service.search(
                    makeReq({
                        types: [DocType.User],
                        sort: { field: "title" as any, direction: "asc" },
                    }),
                    mockUser,
                ),
            ).rejects.toEqual(new HttpException("invalid 'sort'", HttpStatus.BAD_REQUEST));
        });

        it("strips the server-only fts field from returned aux docs", async () => {
            dbService.ftsAuxTrigramCandidates.mockResolvedValue([
                userRow("u1", "gar", { name: "Gardener" }),
            ]);
            dbService.getDocs.mockResolvedValue({
                docs: [{ _id: "u1", type: DocType.User, name: "Gardener", fts: ["gar:1"] }],
            });

            const res = await service.search(
                makeReq({ types: [DocType.User], cms: true, matchAllWords: true }),
                mockUser,
            );
            expect((res[0].doc as any).fts).toBeUndefined();
            expect((res[0].doc as any).name).toBe("Gardener");
        });

        it("searches redirects via the redirect view (slug + toSlug)", async () => {
            (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue({
                [DocType.Redirect]: [REDIRECT_GROUP],
            });
            const redirectRow = (docId: string, slug: string, toSlug: string | null) => ({
                docId,
                trigram: "gar",
                value: { memberOf: [REDIRECT_GROUP], slug, toSlug, updatedTimeUtc: 1 },
            });
            dbService.ftsAuxTrigramCandidates.mockResolvedValue([
                redirectRow("r-slug", "garden", null),
                redirectRow("r-toslug", "x", "garden-2"),
                redirectRow("r-miss", "abc", "def"),
            ]);
            dbService.getDocs.mockImplementation((ids: string[]) => ({
                docs: ids.map((id) => ({ _id: id, type: DocType.Redirect })),
            }));

            const res = await service.search(
                makeReq({ types: [DocType.Redirect], cms: true, matchAllWords: true }),
                mockUser,
            );
            const ids = res.map((r) => r.docId);
            expect(ids).toEqual(expect.arrayContaining(["r-slug", "r-toslug"]));
            expect(ids).not.toContain("r-miss");
            expect(dbService.ftsAuxTrigramCandidates).toHaveBeenCalledWith(
                "fts-trigram-index-redirect",
                expect.any(Array),
            );
            expect(dbService.getDocs).toHaveBeenCalledWith(expect.any(Array), [DocType.Redirect]);
        });
    });

    describe("CmsView permission gating (#160)", () => {
        it("uses View for non-cms Content searches", async () => {
            await service.search(makeReq(), mockUser);
            expect(permissions.PermissionSystem.accessMapToGroups).toHaveBeenCalledWith(
                mockUser.accessMap,
                AclPermission.View,
                [DocType.Post, DocType.Tag, DocType.Language],
            );
        });

        it("uses CmsView for cms:true Content searches", async () => {
            await service.search(makeReq({ cms: true }), mockUser);
            expect(permissions.PermissionSystem.accessMapToGroups).toHaveBeenCalledWith(
                mockUser.accessMap,
                AclPermission.CmsView,
                [DocType.Post, DocType.Tag, DocType.Language],
            );
        });

        it("uses CmsView for cms:true aux (User) searches", async () => {
            (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue({
                [DocType.User]: ["group-user"],
            } as any);
            await service.search(makeReq({ types: [DocType.User], cms: true }), mockUser);
            expect(permissions.PermissionSystem.accessMapToGroups).toHaveBeenCalledWith(
                mockUser.accessMap,
                AclPermission.CmsView,
                [DocType.User],
            );
        });
    });
});
