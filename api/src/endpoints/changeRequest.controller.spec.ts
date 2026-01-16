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

// Mock file type detection helper
jest.mock("../util/fileTypeDetection", () => ({
    detectFileType: jest.fn(async (buffer: Uint8Array) => {
        // Simple detection based on file signature
        if (buffer[0] === 0xff && buffer[1] === 0xd8) {
            return { mime: "image/jpeg", ext: "jpg" };
        }
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
            return { mime: "audio/wav", ext: "wav" };
        }
        if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
            return { mime: "audio/mpeg", ext: "mp3" };
        }
        return null;
    }),
}));

describe("ChangeRequestController", () => {
    let app: NestFastifyApplication;
    const mockChangeRequest = jest.fn();
    const testImagePath = path.join(__dirname, "../test/testImage.jpg");
    const testAudioPath = path.join(__dirname, "../test/silence.wav");

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

    it("should handle audio upload without including incomplete uploadData from JSON", async () => {
        const responseData = { success: true };
        mockChangeRequest.mockResolvedValue(responseData);

        // Simulate what happens when the frontend sends a post with existing fileCollections
        // and new uploadData - LFormData extracts the fileData, leaving incomplete uploadData objects
        const response = await request(app.getHttpServer())
            .post("/changerequest")
            .set("Authorization", "Bearer fake-token")
            .field("changeRequestApiVersion", "0.0.0")
            .field("changeRequestId", JSON.stringify(456))
            .field(
                "changeRequestDoc-JSON",
                JSON.stringify({
                    _id: "post-audio-test",
                    type: DocType.Post,
                    media: {
                        fileCollections: [
                            {
                                languageId: "lang-eng",
                                fileUrl: "https://example.com/audio-eng.mp3",
                                bitrate: 128000,
                                mediaType: "audio",
                            },
                        ],
                        // LFormData removes fileData, leaving incomplete objects
                        uploadData: [
                            {
                                preset: "default",
                                mediaType: "audio",
                                languageId: "lang-spa",
                            },
                        ],
                    },
                }),
            )
            .field("0-changeRequestDoc-files-preset", "default")
            .field("0-changeRequestDoc-files-mediaType", "audio")
            .field("0-changeRequestDoc-files-languageId", "lang-spa")
            .attach("0-changeRequestDoc-files-fileData", testAudioPath);

        expect(response.status).toBe(201);
        expect(response.body).toEqual(responseData);

        // Verify that uploadData only contains complete objects (with fileData)
        // and doesn't include the incomplete object from the JSON
        expect(mockChangeRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 456,
                doc: expect.objectContaining({
                    _id: "post-audio-test",
                    media: expect.objectContaining({
                        fileCollections: [
                            {
                                languageId: "lang-eng",
                                fileUrl: "https://example.com/audio-eng.mp3",
                                bitrate: 128000,
                                mediaType: "audio",
                            },
                        ],
                        // Should only have the complete uploadData with fileData
                        uploadData: [
                            expect.objectContaining({
                                preset: "default",
                                mediaType: "audio",
                                languageId: "lang-spa",
                                fileData: expect.any(Buffer),
                            }),
                        ],
                    }),
                }),
            }),
            "fake-token",
        );

        // Verify uploadData array has exactly 1 element (not 2)
        const callArgs = mockChangeRequest.mock.calls[mockChangeRequest.mock.calls.length - 1];
        expect(callArgs[0].doc.media.uploadData.length).toBe(1);
    });
});
