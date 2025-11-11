import { Test, TestingModule } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import * as request from "supertest";
import multipart from "@fastify/multipart";
import { ChangeRequestController } from "./changeRequest.controller";
import { ChangeRequestService } from "./changeRequest.service";
import { AuthGuard } from "../auth/auth.guard";
import { DocType } from "../enums";
import * as path from "path";

describe("ChangeRequestController", () => {
    let app: NestFastifyApplication;
    const mockChangeRequest = jest.fn();
    const testImagePath = path.join(__dirname, "../test/testImage.jpg");

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ChangeRequestController],
            providers: [
                {
                    provide: ChangeRequestService,
                    useValue: {
                        changeRequest: mockChangeRequest,
                    },
                },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

        // Register multipart plugin for file uploads
        await app.register(multipart);

        app.useGlobalPipes(new ValidationPipe());
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("should handle a multipart change request with valid image", async () => {
        const responseData = { success: true };
        mockChangeRequest.mockResolvedValue(responseData);

        const changeRequest = {
            id: 123,
            doc: {
                _id: "post-test",
                type: DocType.Post,
                imageData: { uploadData: [null] }, // null placeholder for binary data
            },
        };

        const response = await request(app.getHttpServer())
            .post("/changerequest")
            .set("Authorization", "Bearer fake-token")
            .field("apiVersion", "0.0.0")
            .field("changeRequest-JSON", JSON.stringify(changeRequest))
            .field("0-changeRequest-files-filename", "test-image.jpg")
            .field("0-changeRequest-files-preset", "photo")
            .attach("0-changeRequest-files-fileData", testImagePath);

        expect(response.status).toBe(201); // or whatever your route returns
        expect(response.body).toEqual(responseData);

        // Also verify that the service was called with parsed values
        expect(mockChangeRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 123,
                apiVersion: "0.0.0",
                doc: expect.objectContaining({
                    _id: "post-test",
                    imageData: expect.objectContaining({
                        uploadData: [
                            expect.objectContaining({
                                filename: "test-image.jpg",
                                preset: "photo",
                                fileData: expect.any(Buffer),
                            }),
                        ],
                    }),
                }),
            }),
            "fake-token",
        );
    });
});
