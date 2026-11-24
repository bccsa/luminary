import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { ServiceUnavailableException } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { IdentityCacheService } from "../auth/identityCache.service";
import { ownerKey } from "../auth/ownerKey";
import { QueryController } from "../endpoints/query.controller";
import { QueryService } from "../endpoints/query.service";
import { QueryRequestService } from "../endpoints/queryRequest.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { UserDataDbService } from "./userDataDb.service";
import { UserDataService } from "./userData.service";
import { UserQueryService } from "./userQuery.service";
import { UserQueryController } from "./userQuery.controller";
import { userActivityDocumentId } from "./activityIdentity";

describe("shared and user query HTTP routing (mocked databases)", () => {
    let app: NestFastifyApplication;
    let anonymous: boolean;
    const user = { groups: [], jwtPayload: { iss: "https://issuer", sub: "account" } };
    const owner = ownerKey(user, "secret");
    const doc = {
        _id: userActivityDocumentId({ type: "liked", parentId: "post" }),
        type: "liked",
        parentId: "post",
        activityTimeUtc: 100,
        updatedTimeUtc: 100,
    };
    const db = { assertEnabled: jest.fn(), partitionedFind: jest.fn() };
    const shared = { query: jest.fn() };
    const limiter = { check: jest.fn(), recordStrike: jest.fn() };
    const logger = { warn: jest.fn(), error: jest.fn() };

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [QueryController, UserQueryController],
            providers: [
                UserQueryService,
                {
                    provide: IdentityCacheService,
                    useValue: {
                        resolveOrDefault: async () => ({
                            status: anonymous ? "anonymous" : "authenticated",
                            userDetails: anonymous ? { groups: [], anonymous: true } : user,
                        }),
                    },
                },
                UserDataService,
                QueryRequestService,
                { provide: UserDataDbService, useValue: db },
                { provide: QueryService, useValue: shared },
                { provide: QueryRateLimiterService, useValue: limiter },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
                {
                    provide: ConfigService,
                    useValue: new ConfigService({
                        userData: { idSecret: "secret" },
                        query: { maxLimit: 5, expensiveDocsExamined: 10 },
                        validation: { bypassTemplateValidation: true },
                    }),
                },
            ],
        }).compile();
        app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });
    afterAll(async () => {
        await app.close();
    });
    beforeEach(() => {
        jest.clearAllMocks();
        anonymous = false;
        db.assertEnabled.mockReset();
        db.partitionedFind.mockReset().mockResolvedValue({
            docs: [{ ...doc, _id: `${owner}:${doc._id}` }],
            bookmark: `internal:${owner}`,
            execution_stats: { total_docs_examined: 1 },
        });
        shared.query.mockResolvedValue({ docs: [{ _id: "post", type: "post" }] });
        limiter.check.mockReturnValue({ allowed: true });
    });

    const send = (url: string, payload: any) => app.inject({ method: "POST", url, payload });

    it("keeps the shared route independent from the user database", async () => {
        const response = await send("/query", { selector: { type: "post" } });
        expect(response.statusCode).toBe(200);
        expect(shared.query).toHaveBeenCalledWith({ selector: { type: "post" } }, user);
        expect(db.partitionedFind).not.toHaveBeenCalled();
    });

    it.each([undefined, "user"])(
        "uses only the owner's partition for source %s",
        async (dataSource) => {
            const response = await send("/user/query", {
                ...(dataSource ? { dataSource } : {}),
                selector: { type: "liked" },
                use_index: "sync-liked-index",
            });
            expect(response.statusCode).toBe(200);
            expect(response.json().docs).toEqual([doc]);
            expect(db.partitionedFind).toHaveBeenCalledWith(owner, expect.anything());
            expect(shared.query).not.toHaveBeenCalled();
            expect(response.json()).not.toHaveProperty("execution_stats");
            expect(response.json()).not.toHaveProperty("bookmark");
            expect(response.body).not.toContain(owner);
            expect(limiter.check).toHaveBeenCalledTimes(1);
        },
    );

    it("rejects user queries on the shared endpoint", async () => {
        expect(
            (await send("/query", { dataSource: "user", selector: { type: "liked" } })).statusCode,
        ).toBe(400);
        expect(db.partitionedFind).not.toHaveBeenCalled();
        expect(shared.query).not.toHaveBeenCalled();
    });

    it.each(["/query", "/user/query"])(
        "rejects unknown sources at %s without touching a database",
        async (url) => {
            const response = await send(url, { dataSource: "unknown", selector: { type: "post" } });
            expect(response.statusCode).toBe(400);
            expect(shared.query).not.toHaveBeenCalled();
            expect(db.partitionedFind).not.toHaveBeenCalled();
        },
    );

    it.each([null, "", false, 0, ["user"]])(
        "does not treat an invalid source %j as omission",
        async (dataSource) => {
            for (const url of ["/query", "/user/query"]) {
                expect(
                    (await send(url, { dataSource, selector: { type: "liked" } })).statusCode,
                ).toBe(400);
            }
            expect(shared.query).not.toHaveBeenCalled();
            expect(db.partitionedFind).not.toHaveBeenCalled();
        },
    );

    it.each([
        { selector: { type: "liked" }, use_index: "sync-user-index" },
        { selector: { type: "liked" }, limit: 6 },
        { selector: { type: "liked", parentId: { $regex: ".*" } } },
        { selector: { type: "post" } },
    ])("enforces user query rules even with shared validation bypass enabled", async (query) => {
        const response = await send("/user/query", query);
        expect(response.statusCode).toBe(400);
        expect(db.partitionedFind).not.toHaveBeenCalled();
        expect(shared.query).not.toHaveBeenCalled();
    });

    it("requires an authenticated account on the dedicated route", async () => {
        anonymous = true;
        const response = await send("/user/query", { selector: { type: "liked" } });
        expect(response.statusCode).toBe(401);
        expect(db.partitionedFind).not.toHaveBeenCalled();
    });

    it("keeps unavailable user storage retryable without affecting shared queries", async () => {
        db.assertEnabled.mockImplementation(() => {
            throw new ServiceUnavailableException("disabled");
        });
        expect((await send("/user/query", { selector: { type: "liked" } })).statusCode).toBe(503);
        expect((await send("/query", { selector: { type: "post" } })).statusCode).toBe(200);
        expect(db.partitionedFind).not.toHaveBeenCalled();
    });

    it("applies account rate limits on the dedicated route", async () => {
        db.partitionedFind.mockResolvedValue({
            docs: [],
            execution_stats: { total_docs_examined: 100 },
        });
        expect(
            (await send("/user/query", { selector: { type: "liked" }, identifier: "sync" }))
                .statusCode,
        ).toBe(200);
        const identity = limiter.check.mock.calls[0][0];
        expect(limiter.recordStrike).toHaveBeenCalledWith(identity);
        limiter.check.mockReturnValue({ allowed: false, retryAfterMs: 1500 });
        const response = await send("/user/query", {
            dataSource: "user",
            selector: { type: "liked" },
        });
        expect(response.statusCode).toBe(429);
        expect(response.headers["retry-after"]).toBe("2");
        expect(limiter.check.mock.calls[1][0]).toBe(identity);
        expect(db.partitionedFind).toHaveBeenCalledTimes(1);
    });
});
