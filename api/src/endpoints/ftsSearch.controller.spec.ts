import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { FtsSearchController } from "./ftsSearch.controller";
import { FtsSearchService } from "./ftsSearch.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";

describe("FtsSearchController", () => {
    let controller: FtsSearchController;
    let ftsSearchService: { searchWithStats: jest.Mock };
    let rateLimiter: { check: jest.Mock; recordStrike: jest.Mock };
    let logger: { warn: jest.Mock; error: jest.Mock };

    const mockUser = { groups: ["group-public-users"], userId: "mock-user" };
    const cheapStats = {
        trigrams: 4,
        keptTrigrams: 4,
        estimatedCandidateRows: 12,
        candidateRows: 12,
        survivors: 2,
        topK: 2,
        candidateRowBudget: 3000,
    };

    function mockRequest(user: any = mockUser): FastifyRequest {
        return { user, ip: "127.0.0.1" } as any;
    }

    function mockReply(): FastifyReply & { header: jest.Mock } {
        return { header: jest.fn() } as any;
    }

    function body(partial: Record<string, any> = {}) {
        return { apiVersion: "1", queryString: "garden", ...partial };
    }

    beforeEach(async () => {
        ftsSearchService = { searchWithStats: jest.fn() };
        rateLimiter = {
            check: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
            recordStrike: jest.fn(),
        };
        logger = { warn: jest.fn(), error: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [FtsSearchController],
            providers: [
                { provide: FtsSearchService, useValue: ftsSearchService },
                { provide: QueryRateLimiterService, useValue: rateLimiter },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<FtsSearchController>(FtsSearchController);
    });

    it("returns cheap FTS results without logging or striking", async () => {
        const results = [{ docId: "d1", score: 1, wordMatchScore: 0, doc: {} }];
        ftsSearchService.searchWithStats.mockResolvedValue({ results, stats: cheapStats });

        await expect(controller.search(body() as any, mockRequest(), mockReply())).resolves.toBe(
            results,
        );

        expect(ftsSearchService.searchWithStats).toHaveBeenCalledWith(body(), mockUser);
        expect(logger.warn).not.toHaveBeenCalled();
        expect(rateLimiter.recordStrike).not.toHaveBeenCalled();
    });

    it("returns 429 with Retry-After when the limiter denies the request", async () => {
        rateLimiter.check.mockReturnValue({ allowed: false, retryAfterMs: 4200 });
        const reply = mockReply();

        let thrown: any;
        try {
            await controller.search(body() as any, mockRequest(), reply);
        } catch (e) {
            thrown = e;
        }

        expect(thrown).toBeInstanceOf(HttpException);
        expect(thrown.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(reply.header).toHaveBeenCalledWith("Retry-After", "5");
        expect(ftsSearchService.searchWithStats).not.toHaveBeenCalled();
    });

    it.each([
        [{ queryString: "x".repeat(257) }, "queryString"],
        [{ limit: 51 }, "limit"],
        [{ offset: 481 }, "offset + limit"],
        [{ maxTrigramDocPercent: 51 }, "maxTrigramDocPercent"],
    ])("rejects oversized FTS input: %s", async (partial, message) => {
        await expect(
            controller.search(body(partial) as any, mockRequest(), mockReply()),
        ).rejects.toThrow(BadRequestException);
        await expect(
            controller.search(body(partial) as any, mockRequest(), mockReply()),
        ).rejects.toThrow(message);
        expect(ftsSearchService.searchWithStats).not.toHaveBeenCalled();
    });

    it("logs and records a strike for a budget-heavy search", async () => {
        ftsSearchService.searchWithStats.mockResolvedValue({
            results: [],
            stats: { ...cheapStats, estimatedCandidateRows: 3000, candidateRows: 3000 },
        });

        await controller.search(body() as any, mockRequest(), mockReply());

        expect(logger.warn).toHaveBeenCalledWith("Expensive /fts", expect.any(Object));
        expect(logger.warn.mock.calls[0][1]).not.toHaveProperty("queryString");
        expect(rateLimiter.recordStrike).toHaveBeenCalledWith("mock-user");
    });
});
