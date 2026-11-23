import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { ServiceUnavailableException } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { AuthGuard } from "../auth/auth.guard";
import { ownerKey } from "../auth/ownerKey";
import { QueryController } from "../endpoints/query.controller";
import { QueryService } from "../endpoints/query.service";
import { QueryRequestService } from "../endpoints/queryRequest.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { UserDataDbService } from "./userDataDb.service";
import { UserDataService } from "./userData.service";
import { UserQueryService } from "./userQuery.service";
import { UserQueryController } from "./userQuery.controller";
import { normalizeUserActivityDocument } from "./activityIdentity";

describe("shared and user query HTTP routing (mocked databases)", () => {
    let app: NestFastifyApplication;
    let anonymous: boolean;
    const user = { groups: [], jwtPayload: { iss: "https://issuer", sub: "account" } };
    const owner = ownerKey(user, "secret");
    const doc = normalizeUserActivityDocument({
        _id: "liked:post",
        type: "userActivity",
        activityType: "liked",
        parentId: "post",
        activityTimeUtc: 100,
    });
    const db = { assertEnabled: jest.fn(), partitionedFind: jest.fn() };
    const shared = { query: jest.fn() };
    const limiter = { check: jest.fn(), recordStrike: jest.fn() };
    const logger = { warn: jest.fn(), error: jest.fn() };

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [QueryController, UserQueryController],
            providers: [
                UserQueryService,
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
        })
            .overrideGuard(AuthGuard)
            .useValue({
                canActivate(context: any) {
                    context.switchToHttp().getRequest().user = anonymous
                        ? { groups: [], anonymous: true }
                        : user;
                    return true;
                },
            })
            .compile();
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

    it.each([
        ["/user/query", undefined],
        ["/user/query", "user-v2"],
        ["/query", "user-v2"],
        ["/user/query", "user"],
        ["/query", "user"],
    ])("uses only the owner's partition through %s with source %s", async (url, dataSource) => {
        const legacy = dataSource === "user";
        const response = await send(url, {
            ...(dataSource ? { dataSource } : {}),
            selector: { type: legacy ? "userActivity" : "liked" },
            use_index: legacy ? "sync-userActivity-index" : "sync-liked-index",
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().docs[0]).toMatchObject({
            _id: legacy ? "liked:post" : doc._id,
            type: legacy ? "userActivity" : "liked",
        });
        expect(db.partitionedFind).toHaveBeenCalledWith(owner, expect.anything());
        expect(shared.query).not.toHaveBeenCalled();
        expect(response.json()).not.toHaveProperty("execution_stats");
        expect(response.json()).not.toHaveProperty("bookmark");
        expect(response.body).not.toContain(owner);
        expect(limiter.check).toHaveBeenCalledTimes(1);
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

    it.each([null, "", false, 0, ["user-v2"]])(
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

    it("shares cost strikes and rate-limit buckets between the dedicated and compatibility routes", async () => {
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
        const response = await send("/query", {
            dataSource: "user-v2",
            selector: { type: "liked" },
        });
        expect(response.statusCode).toBe(429);
        expect(response.headers["retry-after"]).toBe("2");
        expect(limiter.check.mock.calls[1][0]).toBe(identity);
        expect(db.partitionedFind).toHaveBeenCalledTimes(1);
    });
});
