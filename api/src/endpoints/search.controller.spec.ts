import { Test, TestingModule } from "@nestjs/testing";
import { HttpException } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyRequest } from "fastify";

describe("SearchController", () => {
    let controller: SearchController;
    let searchService: { processReq: jest.Mock };

    const mockUser = { groups: ["group-public-users"], userId: "mock-user" };

    function mockRequest(user: any = mockUser): FastifyRequest {
        return { user } as any;
    }

    beforeEach(async () => {
        searchService = { processReq: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SearchController],
            providers: [{ provide: SearchService, useValue: searchService }],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<SearchController>(SearchController);
    });

    it("should parse X-Query header and call SearchService", async () => {
        searchService.processReq.mockResolvedValue({ docs: [] });

        const xQuery = JSON.stringify({ apiVersion: "1", groups: ["group1"], types: ["post"] });
        await controller.getDocs(xQuery, mockRequest());

        expect(searchService.processReq).toHaveBeenCalledWith(
            expect.objectContaining({ apiVersion: "1" }),
            mockUser,
        );
    });

    it("should throw HttpException when X-Query header is missing", async () => {
        await expect(controller.getDocs("", mockRequest())).rejects.toThrow(HttpException);
    });

    it("should throw HttpException when X-Query contains invalid JSON", async () => {
        await expect(controller.getDocs("not json", mockRequest())).rejects.toThrow(HttpException);
    });

    it("should pass user from request when calling SearchService", async () => {
        searchService.processReq.mockResolvedValue({ docs: [] });

        const xQuery = JSON.stringify({ apiVersion: "1", groups: ["g1"], types: ["post"] });
        await controller.getDocs(xQuery, mockRequest());

        expect(searchService.processReq).toHaveBeenCalledWith(expect.anything(), mockUser);
    });
});
