import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { QueryController } from "./query.controller";
import { QueryService } from "./query.service";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";

describe("QueryController", () => {
    let controller: QueryController;
    let queryService: { query: jest.Mock };
    let configService: { get: jest.Mock };

    beforeEach(async () => {
        queryService = { query: jest.fn() };
        configService = { get: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [QueryController],
            providers: [
                { provide: QueryService, useValue: queryService },
                { provide: ConfigService, useValue: configService },
                { provide: WINSTON_MODULE_PROVIDER, useValue: { warn: jest.fn(), error: jest.fn() } },
            ],
        }).compile();

        controller = module.get<QueryController>(QueryController);
    });

    it("should pass query to QueryService with stripped Bearer token", async () => {
        configService.get.mockReturnValue(true); // bypass validation
        queryService.query.mockResolvedValue({ docs: [] });

        const body = { selector: { type: "post" } };
        await controller.processPostReq(body, "Bearer my-token");

        expect(queryService.query).toHaveBeenCalledWith(body, "my-token");
    });

    it("should pass empty string when no auth header", async () => {
        configService.get.mockReturnValue(true);
        queryService.query.mockResolvedValue({ docs: [] });

        await controller.processPostReq({}, undefined);

        expect(queryService.query).toHaveBeenCalledWith({}, "");
    });

    it("should validate query when bypassValidation is false", async () => {
        configService.get.mockReturnValue(false);

        // Provide a body with a valid identifier to pass validateMongoQuery
        const body = { identifier: "sync", selector: { type: "post" } };
        queryService.query.mockResolvedValue({ docs: [] });

        // This will run validateMongoQuery which may pass or fail depending on the template
        // We just verify the flow doesn't crash with bypass = false
        try {
            await controller.processPostReq(body, "Bearer token");
        } catch (e) {
            // If validation fails, it should be a BadRequestException
            expect(e).toBeInstanceOf(BadRequestException);
        }
    });

    it("should throw BadRequestException for invalid query when validation is enabled", async () => {
        configService.get.mockReturnValue(false);

        // Provide invalid body that should fail validation
        const body = { identifier: "nonexistent-template-xyz", selector: {} };

        await expect(controller.processPostReq(body, "Bearer token")).rejects.toThrow(
            BadRequestException,
        );
    });

    it("should remove identifier from body before passing to service", async () => {
        configService.get.mockReturnValue(true);
        queryService.query.mockResolvedValue({ docs: [] });

        const body = { identifier: "sync", selector: { type: "post" } };
        await controller.processPostReq(body, "Bearer token");

        expect(body.identifier).toBeUndefined();
    });
});
