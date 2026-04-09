import { Test, TestingModule } from "@nestjs/testing";
import { HttpException } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

describe("SearchController", () => {
    let controller: SearchController;
    let searchService: { processReq: jest.Mock };

    beforeEach(async () => {
        searchService = { processReq: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SearchController],
            providers: [{ provide: SearchService, useValue: searchService }],
        }).compile();

        controller = module.get<SearchController>(SearchController);
    });

    it("should parse X-Query header and call SearchService", async () => {
        searchService.processReq.mockResolvedValue({ docs: [] });

        const xQuery = JSON.stringify({ apiVersion: "1", groups: ["group1"], types: ["post"] });
        await controller.getDocs(xQuery, "Bearer my-token");

        expect(searchService.processReq).toHaveBeenCalledWith(
            expect.objectContaining({ apiVersion: "1" }),
            "my-token",
        );
    });

    it("should throw HttpException when X-Query header is missing", async () => {
        await expect(controller.getDocs("", "Bearer token")).rejects.toThrow(HttpException);
    });

    it("should throw HttpException when X-Query contains invalid JSON", async () => {
        await expect(controller.getDocs("not json", "Bearer token")).rejects.toThrow(HttpException);
    });

    it("should pass empty string when no auth header", async () => {
        searchService.processReq.mockResolvedValue({ docs: [] });

        const xQuery = JSON.stringify({ apiVersion: "1", groups: ["g1"], types: ["post"] });
        await controller.getDocs(xQuery, undefined);

        expect(searchService.processReq).toHaveBeenCalledWith(expect.anything(), "");
    });
});
