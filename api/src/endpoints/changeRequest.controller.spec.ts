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

<<<<<<< HEAD
        const changeRequest = {
            id: 123,
            doc: {
                _id: "post-test",
                type: DocType.Post,
                imageData: { uploadData: [null] }, // null placeholder for binary data
            },
        };

        const response = await request(app.getHttpServer())
=======
    /**
     * Helper function to create a test file buffer
     */
    const createTestFile = (content: string = "test content"): Buffer => {
        return Buffer.from(content);
    };

    /**
     * Helper function to create a binary reference string (simulating what LFormData creates)
     */
    const createBinaryRef = (fileId: string): string => {
        return `BINARY_REF-${fileId}`;
    };

    /**
     * Helper function to simulate LFormData format
     * Expects changeRequest to already have "BINARY_REF-{id}" strings where binaries should be
     * Creates form data in the format that LFormData generates
     */
    const createLFormDataRequest = (
        changeRequest: any,
        files: Array<{ id: string; buffer: Buffer }>,
    ) => {
        // Build the request
        const req = request(app.getHttpServer())
>>>>>>> 81f582e5 (refactor: Update ChangeRequestController and LFormData to use binary references for file handling)
            .post("/changerequest")
            .set("Authorization", "Bearer fake-token")
            .field("apiVersion", "0.0.0")
            .field("changeRequest-JSON", JSON.stringify(changeRequest))
            .field("0-changeRequest-files-filename", "test-image.jpg")
            .field("0-changeRequest-files-preset", "photo")
            .attach("0-changeRequest-files-fileData", testImagePath);

<<<<<<< HEAD
        expect(response.status).toBe(201); // or whatever your route returns
        expect(response.body).toEqual(responseData);

        // Also verify that the service was called with parsed values
        expect(mockChangeRequest).toHaveBeenCalledWith(
            expect.objectContaining({
=======
        // Add files using their IDs
        files.forEach((file) => {
            const fileKey = `changeRequest__file__${file.id}`;
            req.attach(fileKey, file.buffer, fileKey);
        });

        return req;
    };

    describe("LFormData binary handling", () => {
        it("should handle image upload with LFormData format", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId = "file-0";
            const changeRequest = {
>>>>>>> 81f582e5 (refactor: Update ChangeRequestController and LFormData to use binary references for file handling)
                id: 123,
                apiVersion: "0.0.0",
                doc: expect.objectContaining({
                    _id: "post-test",
                    imageData: expect.objectContaining({
                        uploadData: [
<<<<<<< HEAD
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
=======
                            {
                                fileData: createBinaryRef(fileId),
                                preset: "photo",
                            },
                        ],
                    },
                },
            };

            const imageBuffer = fs.readFileSync(testImagePath);
            const files = [
                {
                    id: fileId,
                    buffer: imageBuffer,
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 123,
                    apiVersion: "0.0.0",
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

        it("should handle audio upload with LFormData format", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId = "file-0";
            const changeRequest = {
                id: 456,
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

            const audioBuffer = createTestFile("fake audio content");
            const files = [
                {
                    id: fileId,
                    buffer: audioBuffer,
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 456,
                    doc: expect.objectContaining({
                        audioData: expect.objectContaining({
                            uploadData: [
                                expect.objectContaining({
                                    format: "mp3",
                                    bitrate: 128,
                                    fileData: expect.any(Buffer),
                                }),
                            ],
                        }),
                    }),
                }),
                "fake-token",
            );
        });

        it("should handle video upload with LFormData format", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId = "file-0";
            const changeRequest = {
                id: 789,
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

            const videoBuffer = createTestFile("fake video content");
            const files = [
                {
                    id: fileId,
                    buffer: videoBuffer,
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 789,
                    doc: expect.objectContaining({
                        videoData: expect.objectContaining({
                            uploadData: [
                                expect.objectContaining({
                                    format: "mp4",
                                    resolution: "1080p",
                                    fileData: expect.any(Buffer),
                                }),
                            ],
                        }),
                    }),
                }),
                "fake-token",
            );
        });

        it("should handle PDF upload with LFormData format", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId = "file-0";
            const changeRequest = {
                id: 101,
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

            const pdfBuffer = createTestFile("%PDF-1.4 fake PDF content");
            const files = [
                {
                    id: fileId,
                    buffer: pdfBuffer,
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 101,
                    doc: expect.objectContaining({
                        documentData: expect.objectContaining({
                            uploadData: [
                                expect.objectContaining({
                                    filename: "document.pdf",
                                    pages: 10,
                                    fileData: expect.any(Buffer),
                                }),
                            ],
                        }),
                    }),
                }),
                "fake-token",
            );
        });

        it("should handle multiple files in an array", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId0 = "file-0";
            const fileId1 = "file-1";
            const fileId2 = "file-2";
            const changeRequest = {
                id: 202,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-multiple",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId0),
                                preset: "thumbnail",
                            },
                            {
                                fileData: createBinaryRef(fileId1),
                                preset: "medium",
                            },
                            {
                                fileData: createBinaryRef(fileId2),
                                preset: "large",
                            },
                        ],
                    },
                },
            };

            const files = [
                {
                    id: fileId0,
                    buffer: createTestFile("image1"),
                },
                {
                    id: fileId1,
                    buffer: createTestFile("image2"),
                },
                {
                    id: fileId2,
                    buffer: createTestFile("image3"),
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            expect(mockChangeRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 202,
                    doc: expect.objectContaining({
                        imageData: expect.objectContaining({
                            uploadData: [
                                expect.objectContaining({
                                    preset: "thumbnail",
                                    fileData: expect.any(Buffer),
                                }),
                                expect.objectContaining({
                                    preset: "medium",
                                    fileData: expect.any(Buffer),
                                }),
                                expect.objectContaining({
                                    preset: "large",
                                    fileData: expect.any(Buffer),
                                }),
                            ],
                        }),
                    }),
                }),
                "fake-token",
            );
        });

        it("should handle nested binary data structures", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId0 = "file-0";
            const fileId1 = "file-1";
            const changeRequest = {
                id: 303,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-nested",
                    type: DocType.Post,
                    media: {
                        images: {
                            uploadData: [
                                {
                                    fileData: createBinaryRef(fileId0),
                                    preset: "photo",
                                },
                            ],
                        },
                        audio: {
                            uploadData: [
                                {
                                    fileData: createBinaryRef(fileId1),
                                    format: "mp3",
                                },
                            ],
                        },
                    },
                },
            };

            const files = [
                {
                    id: fileId0,
                    buffer: createTestFile("nested image"),
                },
                {
                    id: fileId1,
                    buffer: createTestFile("nested audio"),
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            expect(callArgs.doc.media.images.uploadData[0]).toMatchObject({
                preset: "photo",
                fileData: expect.any(Buffer),
            });
            expect(callArgs.doc.media.audio.uploadData[0]).toMatchObject({
                format: "mp3",
                fileData: expect.any(Buffer),
            });
        });

        it("should handle files at different nesting levels", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId0 = "file-0";
            const fileId1 = "file-1";
            const changeRequest = {
                id: 404,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-deep",
                    type: DocType.Post,
                    level1: {
                        level2: {
                            level3: {
                                fileData: createBinaryRef(fileId0),
                                depth: 3,
                            },
                        },
                    },
                    topLevelFile: {
                        fileData: createBinaryRef(fileId1),
                        depth: 0,
                    },
                },
            };

            const files = [
                {
                    id: fileId0,
                    buffer: createTestFile("deep file"),
                },
                {
                    id: fileId1,
                    buffer: createTestFile("top file"),
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            expect(callArgs.doc.level1.level2.level3).toMatchObject({
                depth: 3,
                fileData: expect.any(Buffer),
            });
            expect(callArgs.doc.topLevelFile).toMatchObject({
                depth: 0,
                fileData: expect.any(Buffer),
            });
        });

        it("should handle mixed binary types in same request", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId0 = "file-0";
            const fileId1 = "file-1";
            const fileId2 = "file-2";
            const fileId3 = "file-3";
            const changeRequest = {
                id: 505,
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-mixed",
                    type: DocType.Content,
                    imageData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId0),
                                type: "image",
                                preset: "default",
                            },
                        ],
                    },
                    audioData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId1),
                                type: "audio",
                                format: "mp3",
                            },
                        ],
                    },
                    videoData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId2),
                                type: "video",
                                format: "mp4",
                            },
                        ],
                    },
                    documentData: {
                        uploadData: [
                            {
                                fileData: createBinaryRef(fileId3),
                                type: "document",
                                format: "pdf",
                            },
                        ],
                    },
                },
            };

            const files = [
                {
                    id: fileId0,
                    buffer: createTestFile("image"),
                },
                {
                    id: fileId1,
                    buffer: createTestFile("audio"),
                },
                {
                    id: fileId2,
                    buffer: createTestFile("video"),
                },
                {
                    id: fileId3,
                    buffer: createTestFile("pdf"),
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            expect(callArgs.doc.imageData.uploadData[0].type).toBe("image");
            expect(callArgs.doc.audioData.uploadData[0].type).toBe("audio");
            expect(callArgs.doc.videoData.uploadData[0].type).toBe("video");
            expect(callArgs.doc.documentData.uploadData[0].type).toBe("document");
        });

        it("should preserve metadata when patching files back", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const fileId = "file-0";
            const changeRequest = {
                id: 606,
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

            const files = [
                {
                    id: fileId,
                    buffer: createTestFile("image with metadata"),
                },
            ];

            const response = await createLFormDataRequest(changeRequest, files);

            expect(response.status).toBe(201);
            const callArgs = mockChangeRequest.mock.calls[0][0];
            const uploadedFile = callArgs.doc.imageData.uploadData[0];
            expect(uploadedFile).toMatchObject({
                preset: "photo",
                filename: "test.jpg",
                width: 1920,
                height: 1080,
                customField: "customValue",
                fileData: expect.any(Buffer),
            });
        });

        it("should handle request without files (JSON only)", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const changeRequest = {
                id: 707,
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
            expect(mockChangeRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 707,
                    apiVersion: "0.0.0",
                    doc: expect.objectContaining({
                        _id: "post-no-files",
                        text: "No binary data here",
                    }),
                }),
                "fake-token",
            );
        });
>>>>>>> 81f582e5 (refactor: Update ChangeRequestController and LFormData to use binary references for file handling)
    });
});
