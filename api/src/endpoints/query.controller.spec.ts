import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { QueryController } from "./query.controller";
import { QueryService } from "./query.service";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyRequest } from "fastify";

describe("QueryController", () => {
    let controller: QueryController;
    let queryService: { query: jest.Mock };
    let configService: { get: jest.Mock };

    const mockUser = { groups: ["group-public-users"], userId: "mock-user" };

    function mockRequest(user: any = mockUser): FastifyRequest {
        return { user } as any;
    }

    /** Config mock keyed by config path. `bypass` toggles template-validation bypass. */
    function configFor(bypass: boolean) {
        return (key: string) => {
            switch (key) {
                case "validation.bypassTemplateValidation":
                    return bypass;
                case "query.maxLimit":
                    return 500;
                default:
                    return undefined;
            }
        };
    }

    beforeEach(async () => {
        queryService = { query: jest.fn() };
        configService = { get: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [QueryController],
            providers: [
                { provide: QueryService, useValue: queryService },
                { provide: ConfigService, useValue: configService },
                {
                    provide: WINSTON_MODULE_PROVIDER,
                    useValue: { warn: jest.fn(), error: jest.fn() },
                },
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
        await controller.processPostReq(body, mockRequest());

        expect(queryService.query).toHaveBeenCalledWith(body, mockUser);
    });

    it("passes a valid query when validation is enabled", async () => {
        configService.get.mockImplementation(configFor(false));
        queryService.query.mockResolvedValue({ docs: [] });

        const body = { identifier: "hybridQuery", selector: { type: "content" } };
        await controller.processPostReq(body, mockRequest());

        expect(queryService.query).toHaveBeenCalled();
    });

    it("throws BadRequestException for an invalid query when validation is enabled", async () => {
        configService.get.mockImplementation(configFor(false));

        // Unknown top-level key — rejected by the universal validator.
        const body = { selector: { type: "content" }, bogusKey: 1 };
        await expect(controller.processPostReq(body, mockRequest())).rejects.toThrow(
            BadRequestException,
        );
        expect(queryService.query).not.toHaveBeenCalled();
    });

    it("removes identifier from the body before passing to the service", async () => {
        configService.get.mockImplementation(configFor(true));
        queryService.query.mockResolvedValue({ docs: [] });

        const body: any = { identifier: "sync", selector: { type: "post" } };
        await controller.processPostReq(body, mockRequest());

        expect(body.identifier).toBeUndefined();
    });
});
