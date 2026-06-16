import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { FtsSearchService } from "./ftsSearch.service";
import { DbService, FtsCandidateRow, FtsCandidateValue } from "../db/db.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger } from "winston";
import { DocType, PublishStatus } from "../enums";
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
});
