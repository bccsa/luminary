import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { QueryService } from "./query.service";
import { DbService } from "../db/db.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger } from "winston";
import { DocType, PublishStatus } from "../enums";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";
import * as permissions from "../permissions/permissions.service";
import * as jwt from "../jwt/processJwt";

describe("QueryService", () => {
    let service: QueryService;
    let dbService: { executeFindQuery: jest.Mock; on: jest.Mock };
    let logger: Logger;

    const mockUser = {
        accessMap: new Map(),
    } as any;

    beforeEach(async () => {
        dbService = {
            executeFindQuery: jest.fn().mockResolvedValue({ docs: [] }),
            on: jest.fn(),
        } as any;
        logger = { info: jest.fn(), error: jest.fn() } as unknown as Logger;

        jest.spyOn(jwt, "processJwt").mockResolvedValue(mockUser);
        jest.spyOn(permissions.PermissionSystem, "accessMapToGroups").mockReturnValue({} as any);

        const moduleRef = await Test.createTestingModule({
            providers: [
                QueryService,
                { provide: DbService, useValue: dbService },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
            ],
        }).compile();

        service = moduleRef.get(QueryService);

        // Wait for constructor's language loading call to complete
        await new Promise((resolve) => setImmediate(resolve));

        // Reset mock after constructor call
        dbService.executeFindQuery.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function makeQuery(selectorInit: (s: MongoSelectorDto) => void): MongoQueryDto {
        const selector = new MongoSelectorDto();
        selectorInit(selector);
        const q = new MongoQueryDto();
        (q as any).selector = selector;
        return q;
    }

    it("throws 400 when invalid type field is provided", async () => {
        const query = makeQuery((s) => {
            // invalid: object type (only simple equality value allowed)
            (s as any).type = { $eq: DocType.Post } as any;
        });
        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("'type' field must be a simple equality value", HttpStatus.BAD_REQUEST),
        );
    });

    it("adds memberOf $elemMatch.$in for Group type", async () => {
        const access = { [DocType.Group]: ["g1", "g2"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = makeQuery((s) => {
            (s as any).type = DocType.Group;
        });

        dbService.executeFindQuery.mockResolvedValueOnce({
            docs: [
                { _id: "g1", type: DocType.Group },
                { _id: "gX", type: DocType.Group },
            ],
        });

        const res = await service.query(query, "token");

        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        expect(calledWith.selector.$and).toBeDefined();
        expect(calledWith.selector.$and).toContainEqual({ type: DocType.Group });
        expect(calledWith.selector.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["g1", "g2"] } },
        });
        expect(res.docs).toHaveLength(2);
    });

    it("adds memberOf $elemMatch.$in for Post type", async () => {
        const access = { [DocType.Post]: ["a", "b"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = makeQuery((s) => {
            (s as any).type = DocType.Post;
        });

        await service.query(query, "token");

        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        expect(calledWith.selector.$and).toBeDefined();
        expect(calledWith.selector.$and).toContainEqual({ type: DocType.Post });
        expect(calledWith.selector.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["a", "b"] } },
        });
    });

    it("throws 400 when no type specified", async () => {
        const access = { [DocType.Post]: ["g1"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue(access);

        const query = makeQuery(() => {
            // no type provided
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("'type' field (string) is required in selector", HttpStatus.BAD_REQUEST),
        );
    });

    it("passes through $limit and $sort untouched", async () => {
        const access = { [DocType.Post]: ["a"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Post;
        (query as any).selector = selector;
        (query as any).$limit = 5;
        (query as any).$sort = [{ createdAt: "desc" }];

        await service.query(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledWith(
            expect.objectContaining({ $limit: 5, $sort: [{ createdAt: "desc" }] }),
        );
    });

    it("requires parentType for Content documents", async () => {
        const query = makeQuery((s) => {
            (s as any).type = DocType.Content;
            // missing parentType
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException(
                "'parentType' field is required for Content type",
                HttpStatus.BAD_REQUEST,
            ),
        );
    });

    it("adds memberOf filter for Content type using parentType permissions", async () => {
        const access = {
            [DocType.Post]: ["gp1", "gp2"],
            [DocType.Language]: ["lang-g1"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        // Mock languages in the service
        (service as any).languages = [
            { _id: "lang-eng", memberOf: ["lang-g1"] },
            { _id: "lang-fra", memberOf: ["lang-g2"] },
        ];

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Content;
        (selector as any).parentType = DocType.Post;
        (query as any).selector = selector;

        await service.query(query, "token");

        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        expect(calledWith.selector.$and).toBeDefined();
        expect(calledWith.selector.$and).toContainEqual({ type: DocType.Content });
        expect(calledWith.selector.$and).toContainEqual({ parentType: DocType.Post });
        expect(calledWith.selector.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["gp1", "gp2"] } },
        });
    });

    it("throws 403 when user has no accessible languages for Content type", async () => {
        const access = {
            [DocType.Post]: ["gp1"],
            [DocType.Language]: ["lang-g-no-match"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        // Mock languages - none match user's language groups
        (service as any).languages = [
            { _id: "lang-eng", memberOf: ["lang-g1"] },
            { _id: "lang-fra", memberOf: ["lang-g2"] },
        ];

        const query = makeQuery((s) => {
            (s as any).type = DocType.Content;
            (s as any).parentType = DocType.Post;
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("Forbidden", HttpStatus.FORBIDDEN),
        );
    });

    it("throws 400 when multiple types are specified", async () => {
        const query = makeQuery((s) => {
            // Multiple types not allowed (using $in operator)
            (s as any).type = { $in: [DocType.Post, DocType.Content] } as any;
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("'type' field must be a simple equality value", HttpStatus.BAD_REQUEST),
        );
    });

    it("intersects provided memberOf with permitted groups", async () => {
        const access = { [DocType.Post]: ["a", "b"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Post;
        // user-provided memberOf includes one permitted (b) and one not permitted (c)
        (selector as any).memberOf = { $in: ["b", "c"] } as any;
        (selector as any).status = "published";
        (query as any).selector = selector;

        await service.query(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledTimes(1);
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$and).toBeDefined();
        expect(sel.$and).toContainEqual({ type: DocType.Post });
        expect(sel.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["b"] } }, // intersection of ["b","c"] with ["a","b"]
        });
        expect(sel.$and).toContainEqual({ status: "published" });
    });

    it("intersects provided memberOf for Content type", async () => {
        const access = {
            [DocType.Post]: ["p1", "p2"],
            [DocType.Language]: ["lang-g1"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        // Mock languages
        (service as any).languages = [{ _id: "lang-eng", memberOf: ["lang-g1"] }];

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Content;
        (selector as any).parentType = DocType.Post;
        (selector as any).memberOf = { $in: ["p1", "x"] } as any; // only p1 intersects with Post groups
        (query as any).selector = selector;

        await service.query(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledTimes(1);
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$and).toBeDefined();
        expect(sel.$and).toContainEqual({ type: DocType.Content });
        expect(sel.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["p1"] } }, // intersection of ["p1", "x"] with ["p1", "p2"]
        });
    });

    it("preserves sibling fields when memberOf is in a multi-field $and condition", async () => {
        const access = { [DocType.Post]: ["a", "b"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        // Provide a pre-existing $and where memberOf shares a condition with status
        (selector as any).$and = [
            { type: DocType.Post },
            { memberOf: { $in: ["a", "c"] }, status: "published" },
        ];
        (query as any).selector = selector;

        await service.query(query, "token");

        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$and).toBeDefined();
        expect(sel.$and).toContainEqual({ type: DocType.Post });
        // status must survive memberOf removal
        expect(sel.$and).toContainEqual({ status: "published" });
        // The service should have replaced memberOf with a permission-filtered version
        expect(sel.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["a"] } }, // intersection of ["a","c"] with ["a","b"]
        });
    });

    it("throws 403 Forbidden when user has no access to requested types/groups", async () => {
        const access = { [DocType.Post]: [] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = makeQuery((s) => {
            (s as any).type = DocType.Post;
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("Forbidden", HttpStatus.FORBIDDEN),
        );
    });

    it("supports top-level $or by wrapping in $and", async () => {
        const access = { [DocType.Post]: ["a", "b"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Post;
        (selector as any).$or = [{ status: "published" }, { language: "en" }];
        (query as any).selector = selector;

        await service.query(query, "token");

        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        expect(calledWith.selector.$and).toBeDefined();
        expect(calledWith.selector.$and).toContainEqual({ type: DocType.Post });
        expect(calledWith.selector.$and).toContainEqual({
            $or: [{ status: "published" }, { language: "en" }],
        });
    });

    it("adds publishing filters for Content type when cms flag is not set", async () => {
        const access = {
            [DocType.Post]: ["p1"],
            [DocType.Language]: ["lang-g1"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        // Mock languages
        (service as any).languages = [{ _id: "lang-eng", memberOf: ["lang-g1"] }];

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Content;
        (selector as any).parentType = DocType.Post;
        (query as any).selector = selector;
        (query as any).cms = false;

        await service.query(query, "token");

        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;

        // Check that $and array contains publishing filters plus type, parentType, and memberOf
        expect(sel.$and).toBeDefined();
        expect(Array.isArray(sel.$and)).toBe(true);
        // Should have: type, parentType, expiryDate filter, status, language, memberOf
        expect(sel.$and.length).toBe(6);

        // Check for expiry date filter
        expect(sel.$and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    $or: expect.arrayContaining([
                        { expiryDate: { $exists: false } },
                        { expiryDate: expect.objectContaining({ $gt: expect.any(Number) }) },
                    ]),
                }),
            ]),
        );

        // Check for other filters
        expect(sel.$and).toContainEqual({ status: PublishStatus.Published });
        expect(sel.$and).toContainEqual({ language: { $in: ["lang-eng"] } });
    });

    it("requires docType for DeleteCmd documents", async () => {
        const query = makeQuery((s) => {
            (s as any).type = DocType.DeleteCmd;
            // missing docType
        });

        // Should throw error because docType is required for permission checks
        await expect(service.query(query, "token")).rejects.toThrow();
    });

    it("checks permissions against docType for DeleteCmd", async () => {
        const access = {
            [DocType.Post]: ["gp1", "gp2"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.DeleteCmd;
        (selector as any).docType = DocType.Post;
        (query as any).selector = selector;

        await service.query(query, "token");

        // Verify that accessMapToGroups was called with the docType (Post), not DeleteCmd
        expect(permissions.PermissionSystem.accessMapToGroups).toHaveBeenCalledWith(
            expect.any(Map),
            expect.any(String),
            expect.arrayContaining([DocType.Post]),
        );

        // Verify the query was executed with proper memberOf filter in $and
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        expect(calledWith.selector.$and).toBeDefined();
        expect(calledWith.selector.$and).toContainEqual({ type: DocType.DeleteCmd });
        expect(calledWith.selector.$and).toContainEqual({ docType: DocType.Post });
        expect(calledWith.selector.$and).toContainEqual({
            memberOf: { $elemMatch: { $in: ["gp1", "gp2"] } },
        });
    });

    it("throws 403 when user has no access to docType groups for DeleteCmd", async () => {
        const access = {
            [DocType.Post]: [], // No access to Post groups
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = makeQuery((s) => {
            (s as any).type = DocType.DeleteCmd;
            (s as any).docType = DocType.Post;
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("Forbidden", HttpStatus.FORBIDDEN),
        );
    });

    it("combines Post and Tag view groups for DeleteCmd with Content docType", async () => {
        const access = {
            [DocType.Post]: ["post-g1", "post-g2"],
            [DocType.Tag]: ["tag-g1", "tag-g2"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.DeleteCmd;
        (selector as any).docType = DocType.Content;
        (query as any).selector = selector;

        await service.query(query, "token");

        // Verify that accessMapToGroups was called with both Post and Tag types
        expect(permissions.PermissionSystem.accessMapToGroups).toHaveBeenCalledWith(
            expect.any(Map),
            expect.any(String),
            expect.arrayContaining([DocType.Post, DocType.Tag]),
        );

        // Verify the query was executed with combined memberOf filter in $and
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const memberOfCondition = calledWith.selector.$and.find(
            (c: any) => c.memberOf !== undefined,
        );
        const memberOfGroups = memberOfCondition.memberOf.$elemMatch.$in;

        // Should contain all groups from both Post and Tag
        expect(memberOfGroups).toHaveLength(4);
        expect(memberOfGroups).toEqual(
            expect.arrayContaining(["post-g1", "post-g2", "tag-g1", "tag-g2"]),
        );
    });

    it("deduplicates groups when combining Post and Tag view groups for DeleteCmd Content", async () => {
        const access = {
            [DocType.Post]: ["shared-g1", "post-g2"],
            [DocType.Tag]: ["shared-g1", "tag-g3"], // shared-g1 appears in both
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.DeleteCmd;
        (selector as any).docType = DocType.Content;
        (query as any).selector = selector;

        await service.query(query, "token");

        // Verify the query was executed with deduplicated memberOf filter in $and
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const memberOfCondition = calledWith.selector.$and.find(
            (c: any) => c.memberOf !== undefined,
        );
        const memberOfGroups = memberOfCondition.memberOf.$elemMatch.$in;

        // Should contain unique groups only (3 unique groups from 4 total)
        expect(memberOfGroups).toHaveLength(3);
        expect(memberOfGroups).toEqual(expect.arrayContaining(["shared-g1", "post-g2", "tag-g3"]));
    });

    it("throws 403 when user has no Post or Tag access for DeleteCmd Content", async () => {
        const access = {
            [DocType.Post]: [],
            [DocType.Tag]: [],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = makeQuery((s) => {
            (s as any).type = DocType.DeleteCmd;
            (s as any).docType = DocType.Content;
        });

        await expect(service.query(query, "token")).rejects.toEqual(
            new HttpException("Forbidden", HttpStatus.FORBIDDEN),
        );
    });
});
