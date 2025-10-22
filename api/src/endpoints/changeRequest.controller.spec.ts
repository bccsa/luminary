import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { ChangeRequestController } from "./changeRequest.controller";
import { ChangeRequestService } from "./changeRequest.service";
import { AuthGuard } from "../auth/auth.guard";
import { DocType } from "../enums";
import * as path from "path";

describe("ChangeRequestController", () => {
    let app: INestApplication;
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

        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it("should handle a multipart change request with valid image", async () => {
        const responseData = { success: true };
        mockChangeRequest.mockResolvedValue(responseData);

        const response = await request(app.getHttpServer())
            .post("/changerequest")
            .set("Authorization", "Bearer fake-token")
            .field("changeRequestApiVersion", "0.0.0")
            .field("changeRequestId", JSON.stringify(123))
            .field(
                "changeRequestDoc-JSON",
                JSON.stringify({
                    _id: "post-test",
                    type: DocType.Post,
                    imageData: { uploadData: [] },
                }),
            )
            .field("0-changeRequestDoc-files-filename", "test-image.jpg")
            .field("0-changeRequestDoc-files-preset", "photo")
            .attach("0-changeRequestDoc-files-fileData", testImagePath);

        expect(response.status).toBe(201); // or whatever your route returns
        expect(response.body).toEqual(responseData);

        // Also verify that the service was called with parsed values
        expect(mockChangeRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 123,
                doc: expect.objectContaining({
                    _id: "post-test",
                    imageData: expect.objectContaining({
                        uploadData: [
                            expect.objectContaining({
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
