import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { FindService } from "./find.service";
import { DbService } from "../db/db.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger } from "winston";
import { DocType } from "../enums";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";
import * as permissions from "../permissions/permissions.service";
import * as jwt from "../jwt/processJwt";

describe("FindService", () => {
    let service: FindService;
    let dbService: { executeFindQuery: jest.Mock };
    let logger: Logger;

    const mockUser = {
        accessMap: new Map(),
    } as any;

    beforeEach(async () => {
        dbService = {
            executeFindQuery: jest.fn().mockResolvedValue({ docs: [] }),
        } as any;
        logger = { info: jest.fn(), error: jest.fn() } as unknown as Logger;

        jest.spyOn(jwt, "processJwt").mockResolvedValue(mockUser);
        jest.spyOn(permissions.PermissionSystem, "accessMapToGroups").mockReturnValue({} as any);

        const moduleRef = await Test.createTestingModule({
            providers: [
                FindService,
                { provide: DbService, useValue: dbService },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
            ],
        }).compile();

        service = moduleRef.get(FindService);
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
            // invalid: object type without $in array
            (s as any).type = { $eq: DocType.Post } as any;
        });
        await expect(service.find(query, "token")).rejects.toEqual(
            new HttpException("Invalid type field in selector", HttpStatus.BAD_REQUEST),
        );
    });

    it("adds memberOf $in for Group type and re-adds type", async () => {
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

        const res = await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                selector: expect.objectContaining({
                    $or: expect.arrayContaining([
                        expect.objectContaining({
                            type: DocType.Group,
                            memberOf: { $in: ["g1", "g2"] },
                        }),
                    ]),
                }),
            }),
        );
        expect(res.docs).toHaveLength(2);
    });

    it("adds memberOf $in for non-Group, non-Content type and re-adds type", async () => {
        const access = { [DocType.Post]: ["a", "b"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = makeQuery((s) => {
            (s as any).type = DocType.Post;
        });

        await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                selector: expect.objectContaining({
                    $or: expect.arrayContaining([
                        expect.objectContaining({
                            type: DocType.Post,
                            memberOf: { $in: ["a", "b"] },
                        }),
                    ]),
                }),
            }),
        );
    });

    it("performs in-memory permission filtering when no type specified", async () => {
        const access = { [DocType.Post]: ["g1"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue(access);

        const query = makeQuery(() => {
            // no type provided
        });

        dbService.executeFindQuery.mockResolvedValueOnce({
            docs: [
                // Group docs without memberOf will be filtered out by in-memory check
                { _id: "g1", type: DocType.Group },
                { _id: "g2", type: DocType.Group },
                {
                    _id: "c1",
                    type: DocType.Content,
                    parentType: DocType.Post,
                    memberOf: ["g1", "x"],
                },
                { _id: "c2", type: DocType.Content, parentType: DocType.Tag, memberOf: ["g2"] },
            ],
        });

        const result = await service.find(query, "token");

        // Should keep content c1 only
        expect(result.docs.map((d: any) => d._id).sort()).toEqual(["c1"]);
    });

    it("passes through $limit and $sort untouched", async () => {
        const access = { [DocType.Content]: ["a"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Content;
        (query as any).selector = selector;
        (query as any).$limit = 5;
        (query as any).$sort = [{ createdAt: "desc" }];

        await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledWith(
            expect.objectContaining({ $limit: 5, $sort: [{ createdAt: "desc" }] }),
        );
    });

    it("uses parentType as docType for Content docs during in-memory filtering", async () => {
        // Allow groups for Post, not for Content
        const access = { [DocType.Post]: ["p1"], [DocType.Content]: [] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValue(access);

        const query = makeQuery(() => {
            // no type provided -> triggers in-memory permission filtering
        });

        dbService.executeFindQuery.mockResolvedValueOnce({
            docs: [
                // Content with parentType=Post and memberOf includes allowed group -> should pass
                { _id: "c1", type: DocType.Content, parentType: DocType.Post, memberOf: ["p1"] },
                // Content with parentType=Post but memberOf does not include allowed group -> filtered out
                { _id: "c2", type: DocType.Content, parentType: DocType.Post, memberOf: ["x"] },
            ],
        });

        const result = await service.find(query, "token");
        // parentType (Post) should drive the allowed groups for content docs
        expect(result.docs.map((d: any) => d._id).sort()).toEqual(["c1"]);
    });

    it("builds a single Content branch with combined memberOf for Post and Tag (in-memory filtering applied post-query)", async () => {
        // Provide groups for post vs tag; content is the query type; service combines groups and filters in-memory later
        const access = {
            [DocType.Post]: ["gp1", "gp2"],
            [DocType.Tag]: ["gt1"],
            [DocType.Content]: ["gcX"], // may be added top-level by service, but branches should use Post/Tag lists
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Content;
        // include another criterion to ensure it is preserved per-branch
        (selector as any).status = "published";
        (query as any).selector = selector;

        await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledTimes(1);
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$or).toBeDefined();
        expect(Array.isArray(sel.$or)).toBe(true);
        expect(sel.$or).toHaveLength(1);

        const contentBranch = sel.$or[0];

        expect(contentBranch).toEqual(
            expect.objectContaining({
                type: DocType.Content,
                status: "published",
            }),
        );
        // combined and deduped groups from Post and Tag
        expect(contentBranch.parentType).toBeUndefined();
        expect(contentBranch.memberOf.$in).toEqual(expect.arrayContaining(["gp1", "gp2", "gt1"]));
        expect(contentBranch.memberOf.$in).toHaveLength(3);
    });

    it("builds $or correctly when multiple types ($in) are specified", async () => {
        const access = {
            [DocType.Post]: ["gp1"],
            [DocType.Tag]: ["gt1"],
            [DocType.Group]: ["g1", "g2"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        // Multiple types: Post and Content
        (selector as any).type = { $in: [DocType.Post, DocType.Content] } as any;
        (selector as any).status = "published";
        (query as any).selector = selector;

        await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledTimes(1);
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$or).toBeDefined();
        expect(Array.isArray(sel.$or)).toBe(true);

        // Expect branches for:
        // - Post type
        // - Content with combined groups from Post and Tag
        const postBranch = expect.objectContaining({
            type: DocType.Post,
            status: "published",
            memberOf: { $in: ["gp1"] },
        });
        expect(sel.$or).toEqual(expect.arrayContaining([postBranch]));

        const contentBranch = sel.$or.find((b: any) => b.type === DocType.Content);
        expect(contentBranch).toBeDefined();
        expect(contentBranch.parentType).toBeUndefined();
        expect(contentBranch.status).toBe("published");
        expect(contentBranch.memberOf.$in).toEqual(expect.arrayContaining(["gp1", "gt1"]));
        expect(contentBranch.memberOf.$in).toHaveLength(2);
    });

    it("intersects provided memberOf with permitted groups for non-Content type", async () => {
        const access = { [DocType.Post]: ["a", "b"] } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Post;
        // user-provided memberOf includes one permitted (b) and one not permitted (c)
        (selector as any).memberOf = { $in: ["b", "c"] } as any;
        (selector as any).status = "published";
        (query as any).selector = selector;

        await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledTimes(1);
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$or).toBeDefined();
        expect(sel.$or).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: DocType.Post,
                    status: "published",
                    memberOf: { $in: ["b"] }, // intersection of ["b","c"] with ["a","b"]
                }),
            ]),
        );
        // ensure original memberOf is removed from root selector (to prevent bypass)
        expect(sel.memberOf).toBeUndefined();
    });

    it("intersects provided memberOf against combined permitted groups for Content", async () => {
        const access = {
            [DocType.Post]: ["p1", "p2"],
            [DocType.Tag]: ["t2"],
        } as any;
        (permissions.PermissionSystem.accessMapToGroups as jest.Mock).mockReturnValueOnce(access);

        const query = new MongoQueryDto();
        const selector = new MongoSelectorDto();
        (selector as any).type = DocType.Content;
        (selector as any).memberOf = { $in: ["p1", "t1", "x"] } as any; // only p1 intersects with Post, none with Tag
        (selector as any).status = "published";
        (query as any).selector = selector;

        await service.find(query, "token");

        expect(dbService.executeFindQuery).toHaveBeenCalledTimes(1);
        const calledWith = dbService.executeFindQuery.mock.calls[0][0];
        const sel = calledWith.selector;
        expect(sel.$or).toBeDefined();
        expect(Array.isArray(sel.$or)).toBe(true);

        // Single content branch with combined groups (Post∪Tag) intersected with provided
        const contentBranch = sel.$or.find((b: any) => b.type === DocType.Content);
        expect(contentBranch).toBeDefined();
        expect(contentBranch.parentType).toBeUndefined();
        expect(contentBranch.status).toBe("published");
        expect(contentBranch.memberOf).toEqual({ $in: ["p1"] });
        // ensure original memberOf is removed from root selector
        expect(sel.memberOf).toBeUndefined();
    });
});
