import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { QueryController } from "./query.controller";
import { QueryService } from "./query.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";

describe("QueryController", () => {
    let controller: QueryController;
    let queryService: { query: jest.Mock };
    let configService: { get: jest.Mock };
    let rateLimiter: { check: jest.Mock; recordStrike: jest.Mock };
    let logger: { warn: jest.Mock; error: jest.Mock };

    const mockUser = { groups: ["group-public-users"], userId: "mock-user" };

    function mockRequest(user: any = mockUser): FastifyRequest {
        return { user, ip: "127.0.0.1" } as any;
    }

    function mockReply(): FastifyReply & { header: jest.Mock } {
        return { header: jest.fn() } as any;
    }

    /** Config mock keyed by config path. `bypass` toggles template-validation bypass. */
    function configFor(bypass: boolean) {
        return (key: string) => {
            switch (key) {
                case "validation.bypassTemplateValidation":
                    return bypass;
                case "query.maxLimit":
                    return 500;
                case "query.expensiveDocsExamined":
                    return 1000;
                case "query.expensiveExaminedRatio":
                    return 10;
                default:
                    return undefined;
            }
        };
    }

    beforeEach(async () => {
        queryService = { query: jest.fn() };
        configService = { get: jest.fn() };
        rateLimiter = {
            check: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
            recordStrike: jest.fn(),
        };
        logger = { warn: jest.fn(), error: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [QueryController],
            providers: [
                { provide: QueryService, useValue: queryService },
                { provide: ConfigService, useValue: configService },
                { provide: QueryRateLimiterService, useValue: rateLimiter },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<QueryController>(QueryController);
    });

    it("passes the query and user through to QueryService (bypass mode)", async () => {
        configService.get.mockImplementation(configFor(true));
        queryService.query.mockResolvedValue({ docs: [] });

        const body = { selector: { type: "post" } };
        await controller.processPostReq(body, mockRequest(), mockReply());

        expect(queryService.query).toHaveBeenCalledWith(body, mockUser);
    });

    it("passes a valid query when validation is enabled", async () => {
        configService.get.mockImplementation(configFor(false));
        queryService.query.mockResolvedValue({ docs: [] });

        const body = { identifier: "hybridQuery", selector: { type: "content" } };
        await controller.processPostReq(body, mockRequest(), mockReply());

        expect(queryService.query).toHaveBeenCalled();
    });

    it("throws BadRequestException for an invalid query when validation is enabled", async () => {
        configService.get.mockImplementation(configFor(false));

        // Unknown top-level key — rejected by the universal validator.
        const body = { selector: { type: "content" }, bogusKey: 1 };
        await expect(
            controller.processPostReq(body, mockRequest(), mockReply()),
        ).rejects.toThrow(BadRequestException);
        expect(queryService.query).not.toHaveBeenCalled();
    });

    it("removes identifier from the body before passing to the service", async () => {
        configService.get.mockImplementation(configFor(true));
        queryService.query.mockResolvedValue({ docs: [] });

        const body: any = { identifier: "sync", selector: { type: "post" } };
        await controller.processPostReq(body, mockRequest(), mockReply());

        expect(body.identifier).toBeUndefined();
    });

    it("returns 429 with Retry-After when the rate limiter denies the request", async () => {
        configService.get.mockImplementation(configFor(true));
        rateLimiter.check.mockReturnValue({ allowed: false, retryAfterMs: 4200 });
        const reply = mockReply();

        let thrown: any;
        try {
            await controller.processPostReq({ selector: { type: "post" } }, mockRequest(), reply);
        } catch (e) {
            thrown = e;
        }

        expect(thrown).toBeInstanceOf(HttpException);
        expect(thrown.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(reply.header).toHaveBeenCalledWith("Retry-After", "5"); // ceil(4200/1000)
        expect(queryService.query).not.toHaveBeenCalled();
    });

    it("logs and records a strike for an expensive query, and strips execution_stats", async () => {
        configService.get.mockImplementation(configFor(true));
        queryService.query.mockResolvedValue({
            docs: [],
            execution_stats: { total_docs_examined: 5000, execution_time_ms: 12 },
        });

        const result = await controller.processPostReq(
            { selector: { type: "post" } },
            mockRequest(),
            mockReply(),
        );

        expect(logger.warn).toHaveBeenCalledWith("Expensive /query", expect.any(Object));
        expect(rateLimiter.recordStrike).toHaveBeenCalledWith("mock-user");
        expect(result.execution_stats).toBeUndefined();
    });

    it("keys an anonymous identity by ip when there is no userId", async () => {
        configService.get.mockImplementation(configFor(true));
        queryService.query.mockResolvedValue({
            docs: [],
            execution_stats: { total_docs_examined: 5000 },
        });

        await controller.processPostReq(
            { selector: { type: "post" } },
            mockRequest({ groups: [] }),
            mockReply(),
        );

        expect(rateLimiter.recordStrike).toHaveBeenCalledWith("anon:127.0.0.1");
    });

    it("does not strike or warn for a cheap query", async () => {
        configService.get.mockImplementation(configFor(true));
        queryService.query.mockResolvedValue({
            docs: [{ _id: "x" }],
            execution_stats: { total_docs_examined: 1 },
        });

        await controller.processPostReq({ selector: { type: "post" } }, mockRequest(), mockReply());

        expect(logger.warn).not.toHaveBeenCalled();
        expect(rateLimiter.recordStrike).not.toHaveBeenCalled();
    });
});
