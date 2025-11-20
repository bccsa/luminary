import { Test as NestTest, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { ChangeRequestController } from "./changeRequest.controller";
import { ChangeRequestService } from "./changeRequest.service";
import { AuthGuard } from "../auth/auth.guard";
import { DocType } from "../enums";
import * as path from "path";
import * as fs from "fs";

describe("ChangeRequestController", () => {
    let app: INestApplication;
    const mockChangeRequest = jest.fn();
    const testImagePath = path.join(__dirname, "../test/testImage.jpg");

    beforeAll(async () => {
        const module: TestingModule = await NestTest.createTestingModule({
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

    beforeEach(() => {
        mockChangeRequest.mockClear();
    });

    /**
     * Helper function to create a test file buffer
     */
    const createTestFile = (content: string = "test content"): Buffer => {
        return Buffer.from(content);
    };

    /**
     * Helper function to create a placeholder object (simulating what LFormData creates)
     */
    const createPlaceholder = (fileId: string, path: string[] = []) => ({
        __fileId: fileId,
        __path: path,
    });

    /**
     * Helper function to simulate LFormData format
     * Expects changeRequest to already have placeholder objects where binaries should be
     * Creates form data in the format that LFormData generates
     */
    const createLFormDataRequest = (
        changeRequest: any,
        files: Array<{ fieldname: string; buffer: Buffer; metadata?: Record<string, any> }>,
    ) => {
        // Extract placeholders and map them to files
        const fileMap = new Map<string, { placeholder: any; file: (typeof files)[0] }>();
        let fileIndex = 0;

        const extractPlaceholders = (obj: any, currentPath: string[] = []): void => {
            if (obj === null || typeof obj !== "object") return;

            if (Array.isArray(obj)) {
                obj.forEach((item, i) => {
                    if (
                        item &&
                        typeof item === "object" &&
                        "__fileId" in item &&
                        "__path" in item &&
                        Array.isArray((item as any).__path)
                    ) {
                        // This is a placeholder
                        if (fileIndex < files.length) {
                            const file = files[fileIndex];
                            fileMap.set(`changeRequest__file__${fileIndex}`, {
                                placeholder: item,
                                file,
                            });
                            fileIndex++;
                        }
                    } else if (typeof item === "object" && item !== null) {
                        extractPlaceholders(item, [...currentPath, `[${i}]`]);
                    }
                });
            } else {
                for (const [key, value] of Object.entries(obj)) {
                    if (key === "__proto__" || key === "constructor" || key === "prototype") {
                        continue;
                    }

                    if (
                        value &&
                        typeof value === "object" &&
                        "__fileId" in value &&
                        "__path" in value &&
                        Array.isArray((value as any).__path)
                    ) {
                        // This is a placeholder
                        if (fileIndex < files.length) {
                            const file = files[fileIndex];
                            fileMap.set(`changeRequest__file__${fileIndex}`, {
                                placeholder: value,
                                file,
                            });
                            fileIndex++;
                        }
                    } else if (typeof value === "object" && value !== null) {
                        extractPlaceholders(value, [...currentPath, key]);
                    }
                }
            }
        };

        extractPlaceholders(changeRequest);

        // Build the request
        const req = request(app.getHttpServer())
            .post("/changerequest")
            .set("Authorization", "Bearer fake-token")
            .field("apiVersion", changeRequest.apiVersion || "0.0.0")
            .field("changeRequest__json", JSON.stringify(changeRequest));

        // Add files and metadata in order
        for (let i = 0; i < files.length; i++) {
            const fileKey = `changeRequest__file__${i}`;
            const fileInfo = fileMap.get(fileKey);
            if (fileInfo) {
                const metaKey = `${fileKey}__meta`;
                const metadata = fileInfo.file.metadata || {};
                req.field(metaKey, JSON.stringify(metadata));
                req.attach(fileKey, fileInfo.file.buffer, fileInfo.file.fieldname);
            }
        }

        return req;
    };

    describe("LFormData binary handling", () => {
        it("should handle image upload with LFormData format", async () => {
            const responseData = { success: true };
            mockChangeRequest.mockResolvedValue(responseData);

            const changeRequest = {
                id: 123,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-test",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            createPlaceholder("file-0", ["doc", "imageData", "uploadData", "[0]"]),
                        ],
                    },
                },
            };

            const imageBuffer = fs.readFileSync(testImagePath);
            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: imageBuffer,
                    metadata: { preset: "photo" }, // Metadata sent separately in __meta field
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

            const changeRequest = {
                id: 456,
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-audio",
                    type: DocType.Content,
                    audioData: {
                        uploadData: [
                            createPlaceholder("file-0", ["doc", "audioData", "uploadData", "[0]"]),
                        ],
                    },
                },
            };

            const audioBuffer = createTestFile("fake audio content");
            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: audioBuffer,
                    metadata: { format: "mp3", bitrate: 128 },
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

            const changeRequest = {
                id: 789,
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-video",
                    type: DocType.Content,
                    videoData: {
                        uploadData: [
                            createPlaceholder("file-0", ["doc", "videoData", "uploadData", "[0]"]),
                        ],
                    },
                },
            };

            const videoBuffer = createTestFile("fake video content");
            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: videoBuffer,
                    metadata: { format: "mp4", resolution: "1080p" },
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

            const changeRequest = {
                id: 101,
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-pdf",
                    type: DocType.Content,
                    documentData: {
                        uploadData: [
                            createPlaceholder("file-0", [
                                "doc",
                                "documentData",
                                "uploadData",
                                "[0]",
                            ]),
                        ],
                    },
                },
            };

            const pdfBuffer = createTestFile("%PDF-1.4 fake PDF content");
            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: pdfBuffer,
                    metadata: { filename: "document.pdf", pages: 10 },
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

            const changeRequest = {
                id: 202,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-multiple",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            createPlaceholder("file-0", ["doc", "imageData", "uploadData", "[0]"]),
                            createPlaceholder("file-1", ["doc", "imageData", "uploadData", "[1]"]),
                            createPlaceholder("file-2", ["doc", "imageData", "uploadData", "[2]"]),
                        ],
                    },
                },
            };

            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: createTestFile("image1"),
                    metadata: { preset: "thumbnail" },
                },
                {
                    fieldname: "changeRequest__file__1",
                    buffer: createTestFile("image2"),
                    metadata: { preset: "medium" },
                },
                {
                    fieldname: "changeRequest__file__2",
                    buffer: createTestFile("image3"),
                    metadata: { preset: "large" },
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

            const changeRequest = {
                id: 303,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-nested",
                    type: DocType.Post,
                    media: {
                        images: {
                            uploadData: [
                                createPlaceholder("file-0", [
                                    "doc",
                                    "media",
                                    "images",
                                    "uploadData",
                                    "[0]",
                                ]),
                            ],
                        },
                        audio: {
                            uploadData: [
                                createPlaceholder("file-1", [
                                    "doc",
                                    "media",
                                    "audio",
                                    "uploadData",
                                    "[0]",
                                ]),
                            ],
                        },
                    },
                },
            };

            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: createTestFile("nested image"),
                    metadata: { preset: "photo" },
                },
                {
                    fieldname: "changeRequest__file__1",
                    buffer: createTestFile("nested audio"),
                    metadata: { format: "mp3" },
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

            const changeRequest = {
                id: 404,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-deep",
                    type: DocType.Post,
                    level1: {
                        level2: {
                            level3: createPlaceholder("file-0", [
                                "doc",
                                "level1",
                                "level2",
                                "level3",
                            ]),
                        },
                    },
                    topLevelFile: createPlaceholder("file-1", ["doc", "topLevelFile"]),
                },
            };

            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: createTestFile("deep file"),
                    metadata: { depth: 3 },
                },
                {
                    fieldname: "changeRequest__file__1",
                    buffer: createTestFile("top file"),
                    metadata: { depth: 0 },
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

            const changeRequest = {
                id: 505,
                apiVersion: "0.0.0",
                doc: {
                    _id: "content-mixed",
                    type: DocType.Content,
                    imageData: {
                        uploadData: [
                            createPlaceholder("file-0", ["doc", "imageData", "uploadData", "[0]"]),
                        ],
                    },
                    audioData: {
                        uploadData: [
                            createPlaceholder("file-1", ["doc", "audioData", "uploadData", "[0]"]),
                        ],
                    },
                    videoData: {
                        uploadData: [
                            createPlaceholder("file-2", ["doc", "videoData", "uploadData", "[0]"]),
                        ],
                    },
                    documentData: {
                        uploadData: [
                            createPlaceholder("file-3", [
                                "doc",
                                "documentData",
                                "uploadData",
                                "[0]",
                            ]),
                        ],
                    },
                },
            };

            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: createTestFile("image"),
                    metadata: { type: "image", preset: "default" },
                },
                {
                    fieldname: "changeRequest__file__1",
                    buffer: createTestFile("audio"),
                    metadata: { type: "audio", format: "mp3" },
                },
                {
                    fieldname: "changeRequest__file__2",
                    buffer: createTestFile("video"),
                    metadata: { type: "video", format: "mp4" },
                },
                {
                    fieldname: "changeRequest__file__3",
                    buffer: createTestFile("pdf"),
                    metadata: { type: "document", format: "pdf" },
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

            const changeRequest = {
                id: 606,
                apiVersion: "0.0.0",
                doc: {
                    _id: "post-metadata",
                    type: DocType.Post,
                    imageData: {
                        uploadData: [
                            createPlaceholder("file-0", ["doc", "imageData", "uploadData", "[0]"]),
                        ],
                    },
                },
            };

            const files = [
                {
                    fieldname: "changeRequest__file__0",
                    buffer: createTestFile("image with metadata"),
                    metadata: {
                        preset: "photo",
                        filename: "test.jpg",
                        width: 1920,
                        height: 1080,
                        customField: "customValue",
                    },
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
    });
});
