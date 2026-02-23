import { Test, TestingModule } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import {
    FastifyAdapter,
    NestFastifyApplication,
} from "@nestjs/platform-fastify";
import * as request from "supertest";
import multipart from "@fastify/multipart";
import { ChangeRequestController } from "./changeRequest.controller";
import { ChangeRequestService } from "./changeRequest.service";
import { AuthGuard } from "../auth/auth.guard";
import { DocType } from "../enums";
import * as path from "path";
import * as fs from "fs";

/**
 * Assert that a value is binary data — either a real Buffer or its JSON-serialized form.
 */
function expectBinaryData(value: unknown): void {
    const isBuffer = Buffer.isBuffer(value);
    const isSerializedBuffer =
        typeof value === "object" &&
        value !== null &&
        (value as Record<string, unknown>).type === "Buffer" &&
        Array.isArray((value as Record<string, unknown>).data);
    expect(isBuffer || isSerializedBuffer).toBe(true);
}

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

        app = module.createNestApplication<NestFastifyApplication>(
            new FastifyAdapter(),
        );
        await app.register(multipart);
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        mockChangeRequest.mockClear();
    });

    const createTestFile = (content: string = "test content"): Buffer =>
        Buffer.from(content);

    const createBinaryRef = (fileId: string): string => `BINARY_REF-${fileId}`;

    const createLFormDataRequest = (
        changeRequest: any,
        files: Array<{ id: string; buffer: Buffer }>,
    ) => {
        const req = request(app.getHttpServer())
            .post("/changerequest")
            .set("Authorization", "Bearer fake-token")
            .field("apiVersion", changeRequest.apiVersion || "0.0.0")
            .field("changeRequest__json", JSON.stringify(changeRequest));

        files.forEach((file) => {
            const fileKey = `changeRequest__file__${file.id}`;
            req.attach(fileKey, file.buffer, fileKey);
        });

        return req;
    };

    describe("LFormData binary handling", () => {
        it("should handle image upload with LFormData format", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const fileId = "file-0";
            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-test",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId),
                                preset: "photo",
                            },
                        ],
                    },
                },
            };

            const imageBuffer = fs.readFileSync(testImagePath);
            const response = await createLFormDataRequest(changeRequest, [
                { id: fileId, buffer: imageBuffer },
            ]);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledTimes(1);
            const [arg, token] = mockChangeRequest.mock.calls[0];
            expect(token).toBe("fake-token");
            expect(arg.apiVersion).toBe("0.0.0");
            expect(arg.doc._id).toBe("post-test");
            expect(arg.doc.imageData.uploadData[0].preset).toBe("photo");
            expectBinaryData(arg.doc.imageData.uploadData[0].fileData);
        });

        it("should handle audio upload with LFormData format", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const fileId = "file-0";
            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-audio",
                    type: DocType.Content,
                    audioData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId),
                                format: "mp3",
                                bitrate: 128,
                            },
                        ],
                    },
                },
            };

            const response = await createLFormDataRequest(changeRequest, [
                { id: fileId, buffer: createTestFile("fake audio content") },
            ]);

            expect(response.status).toBe(201);
            const [arg, token] = mockChangeRequest.mock.calls[0];
            expect(token).toBe("fake-token");
            expect(arg.doc.audioData.uploadData[0].format).toBe("mp3");
            expect(arg.doc.audioData.uploadData[0].bitrate).toBe(128);
            expectBinaryData(arg.doc.audioData.uploadData[0].fileData);
        });

        it("should handle video upload with LFormData format", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const fileId = "file-0";
            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-video",
                    type: DocType.Content,
                    videoData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId),
                                format: "mp4",
                                resolution: "1080p",
                            },
                        ],
                    },
                },
            };

            const response = await createLFormDataRequest(changeRequest, [
                { id: fileId, buffer: createTestFile("fake video content") },
            ]);

            expect(response.status).toBe(201);
            const [arg, token] = mockChangeRequest.mock.calls[0];
            expect(token).toBe("fake-token");
            expect(arg.doc.videoData.uploadData[0].format).toBe("mp4");
            expect(arg.doc.videoData.uploadData[0].resolution).toBe("1080p");
            expectBinaryData(arg.doc.videoData.uploadData[0].fileData);
        });

        it("should handle PDF upload with LFormData format", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const fileId = "file-0";
            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-pdf",
                    type: DocType.Content,
                    documentData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId),
                                filename: "document.pdf",
                                pages: 10,
                            },
                        ],
                    },
                },
            };

            const response = await createLFormDataRequest(changeRequest, [
                {
                    id: fileId,
                    buffer: createTestFile("%PDF-1.4 fake PDF content"),
                },
            ]);

            expect(response.status).toBe(201);
            const [arg, token] = mockChangeRequest.mock.calls[0];
            expect(token).toBe("fake-token");
            expect(arg.doc.documentData.uploadData[0].filename).toBe(
                "document.pdf",
            );
            expect(arg.doc.documentData.uploadData[0].pages).toBe(10);
            expectBinaryData(arg.doc.documentData.uploadData[0].fileData);
        });

        it("should handle multiple files in an array", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-multiple",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef("file-0"),
                                preset: "thumbnail",
                            },
                            {
                                fileData: createBinaryRef("file-1"),
                                preset: "medium",
                            },
                            {
                                fileData: createBinaryRef("file-2"),
                                preset: "large",
                            },
                        ],
                    },
                },
            };

            const files = [
                { id: "file-0", buffer: createTestFile("image1") },
                { id: "file-1", buffer: createTestFile("image2") },
                { id: "file-2", buffer: createTestFile("image3") },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const [arg, token] = mockChangeRequest.mock.calls[0];
            expect(token).toBe("fake-token");
            expect(arg.doc.imageData.uploadData).toHaveLength(3);
            expect(arg.doc.imageData.uploadData[0].preset).toBe("thumbnail");
            expect(arg.doc.imageData.uploadData[1].preset).toBe("medium");
            expect(arg.doc.imageData.uploadData[2].preset).toBe("large");
            expectBinaryData(arg.doc.imageData.uploadData[0].fileData);
            expectBinaryData(arg.doc.imageData.uploadData[1].fileData);
            expectBinaryData(arg.doc.imageData.uploadData[2].fileData);
        });

        it("should handle nested binary data structures", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-nested",
                    type: DocType.Post,
                    media: {
                        images: {
                            uploadData: [
                                {
                                    fileData: createBinaryRef("file-0"),
                                    preset: "photo",
                                },
                            ],
                        },
                        audio: {
                            uploadData: [
                                {
                                    fileData: createBinaryRef("file-1"),
                                    format: "mp3",
                                },
                            ],
                        },
                    },
                },
            };

            const files = [
                { id: "file-0", buffer: createTestFile("nested image") },
                { id: "file-1", buffer: createTestFile("nested audio") },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            expect(callArgs.doc.media.images.uploadData[0].preset).toBe(
                "photo",
            );
            expectBinaryData(callArgs.doc.media.images.uploadData[0].fileData);
            expect(callArgs.doc.media.audio.uploadData[0].format).toBe("mp3");
            expectBinaryData(callArgs.doc.media.audio.uploadData[0].fileData);
        });

        it("should handle files at different nesting levels", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-deep",
                    type: DocType.Post,
                    level1: {
                        level2: {
                            level3: {
                                fileData: createBinaryRef("file-0"),
                                depth: 3,
                            },
                        },
                    },
                    topLevelFile: {
                        fileData: createBinaryRef("file-1"),
                        depth: 0,
                    },
                },
            };

            const files = [
                { id: "file-0", buffer: createTestFile("deep file") },
                { id: "file-1", buffer: createTestFile("top file") },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            expect(callArgs.doc.level1.level2.level3.depth).toBe(3);
            expectBinaryData(callArgs.doc.level1.level2.level3.fileData);
            expect(callArgs.doc.topLevelFile.depth).toBe(0);
            expectBinaryData(callArgs.doc.topLevelFile.fileData);
        });

        it("should handle mixed binary types in same request", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-mixed",
                    type: DocType.Content,
                    imageData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef("file-0"),
                                type: "image",
                                preset: "default",
                            },
                        ],
                    },
                    audioData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef("file-1"),
                                type: "audio",
                                format: "mp3",
                            },
                        ],
                    },
                    videoData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef("file-2"),
                                type: "video",
                                format: "mp4",
                            },
                        ],
                    },
                    documentData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef("file-3"),
                                type: "document",
                                format: "pdf",
                            },
                        ],
                    },
                },
            };

            const files = [
                { id: "file-0", buffer: createTestFile("image") },
                { id: "file-1", buffer: createTestFile("audio") },
                { id: "file-2", buffer: createTestFile("video") },
                { id: "file-3", buffer: createTestFile("pdf") },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            expect(callArgs.doc.imageData.uploadData[0].type).toBe("image");
            expect(callArgs.doc.audioData.uploadData[0].type).toBe("audio");
            expect(callArgs.doc.videoData.uploadData[0].type).toBe("video");
            expect(callArgs.doc.documentData.uploadData[0].type).toBe(
                "document",
            );
        });

        it("should preserve metadata when patching files back", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const fileId = "file-0";
            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-metadata",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId),
                                preset: "photo",
                                filename: "test.jpg",
                                width: 1920,
                                height: 1080,
                                customField: "customValue",
                            },
                        ],
                    },
                },
            };

            const response = await createLFormDataRequest(changeRequest, [
                { id: fileId, buffer: createTestFile("image with metadata") },
            ]);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            const uploadedFile = callArgs.doc.imageData.uploadData[0];
            expect(uploadedFile.preset).toBe("photo");
            expect(uploadedFile.filename).toBe("test.jpg");
            expect(uploadedFile.width).toBe(1920);
            expect(uploadedFile.height).toBe(1080);
            expect(uploadedFile.customField).toBe("customValue");
            expectBinaryData(uploadedFile.fileData);
        });

        it("should handle request without files (JSON only)", async () => {
            mockChangeRequest.mockResolvedValue({ success: true });

            const changeRequest = {
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-no-files",
                    type: DocType.Post,
                    text: "No binary data here",
                },
            };

            const response = await request(app.getHttpServer())
                .post("/changerequest")
                .set("Authorization", "Bearer fake-token")
                .send(changeRequest);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledTimes(1);
            const [arg, token] = mockChangeRequest.mock.calls[0];
            expect(token).toBe("fake-token");
            expect(arg.apiVersion).toBe("0.0.0");
            expect(arg.doc._id).toBe("post-no-files");
            expect(arg.doc.text).toBe("No binary data here");
        });
    });
});
