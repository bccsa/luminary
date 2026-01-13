import "reflect-metadata";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import * as path from "path";

// Mock music-metadata for tests to avoid ESM import issues
jest.mock(
    "music-metadata",
    () => ({
        parseBuffer: jest.fn((buffer: Uint8Array) => {
            // Simple heuristic: real audio files are larger than 100 bytes
            // and will have RIFF/WAVE headers for WAV files
            if (buffer.byteLength < 100) {
                return Promise.reject(new Error("Invalid audio file"));
            }
            return Promise.resolve({
                format: {
                    codec: "pcm",
                    container: "WAVE/wave",
                    numberOfChannels: 1,
                    bitrate: 128000,
                },
            });
        }),
    }),
    { virtual: true },
);

describe("validateChangeRequest", () => {
    let db: DbService;

    beforeAll(async () => {
        db = (await createTestingModule("validate-change-request")).dbService;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it("validates a correctly formatted document", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(true);
        expect(result.error).toBe(undefined);
    });

    it("fails validation for an invalid change request", async () => {
        const changeRequest = {
            id: 42,
            invalidProperty: {},
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Change request validation failed");
    });

    it("fails validation for an invalid document type", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "invalid document type",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
                default: 1,
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Invalid document type");
    });

    it("fails validation for invalid document data", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: "invalid data (should have been an array)",
                languageCode: "eng",
                name: "English",
                default: 1,
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted language document validation failed");
    });

    it("fails validation for a wrong nested type", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "test-group",
                type: "group",
                name: "Test",
                acl: [
                    {
                        type: "language",
                        groupId: "group-public-content",
                        permission: ["view"],
                    },
                    {
                        type: "language",
                        groupId: ["not", "a", "string"], // Array instead of string - will fail @IsString()
                        permission: ["view"],
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted group document validation failed");
    });

    it("fails validation for a nested field of enums", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "test-group",
                type: "group",
                name: "Test",
                acl: [
                    {
                        type: "language",
                        groupId: "group-public-content",
                        permission: ["view"],
                    },
                    {
                        type: "language",
                        groupId: "group-private-content",
                        permission: ["view", "invalid"], // This field is modified to include an invalid value
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted group document validation failed");
    });

    it("removes invalid fields from the document", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "new-lang",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "new",
                name: "New Language",
                translations: {
                    stringTranslation: "String Translation",
                },
                invalidField: "invalid",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);
        expect(result.validatedData.invalidField).toBe(undefined);
    });

    it("fails validation on an invalid uploaded image document", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "post-post1",
                type: "post",
                memberOf: ["group-public-content"],
                tags: ["tag-category1", "tag-topicA"],
                publishDateVisible: false,
                imageData: {
                    fileCollections: [],
                    uploadData: [
                        {
                            fileData: Buffer.from("some invalid data"),
                            preset: "default",
                        },
                    ],
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toBeDefined();
    });

    it("validates a valid uploaded image document", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "post-post1",
                type: "post",
                memberOf: ["group-public-content"],
                tags: ["tag-category1", "tag-topicA"],
                publishDateVisible: false,
                postType: "blog",
                imageData: {
                    fileCollections: [
                        {
                            aspectRatio: 1,
                            imageFiles: [
                                { filename: "unique-file-name", width: 1000, height: 1000 },
                            ],
                        },
                    ],
                    uploadData: [
                        {
                            fileData: fs.readFileSync(
                                path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                            ),
                            preset: "default",
                        },
                    ],
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("fails validation when ACL entries contain invalid permissions", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "test-group",
                type: "group",
                name: "Test Group",
                acl: [
                    {
                        type: "language",
                        groupId: "group-public-content",
                        permission: ["view"],
                    },
                    {
                        type: "language",
                        groupId: "group-private-content",
                        permission: ["invalid-permission"], // Invalid permission, should trigger validation error
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain(
            "acl[1].permission has failed the following constraints: isEnum",
        );
    });

    it("validates a post with valid audio upload data for multiple languages", async () => {
        const audioFile = fs.readFileSync(path.resolve(__dirname + "/../test/" + "silence.wav"));

        const changeRequest = {
            id: 42,
            doc: {
                _id: "post-test",
                type: "post",
                memberOf: ["group-super-admins"],
                postType: "blog",
                tags: [],
                publishDateVisible: true,
                media: {
                    fileCollections: [],
                    uploadData: [
                        {
                            fileData: audioFile,
                            preset: "default",
                            mediaType: "audio",
                            languageId: "lang-eng",
                        },
                        {
                            fileData: audioFile,
                            preset: "default",
                            mediaType: "audio",
                            languageId: "lang-spa",
                        },
                        {
                            fileData: audioFile,
                            preset: "default",
                            mediaType: "audio",
                            languageId: "lang-fra",
                        },
                    ],
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(true);
        expect(result.error).toBe(undefined);
    });

    it("fails validation for post with invalid audio upload data", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "post-test",
                type: "post",
                memberOf: ["group-super-admins"],
                postType: "blog",
                tags: [],
                publishDateVisible: true,
                media: {
                    fileCollections: [],
                    uploadData: [
                        {
                            fileData: Buffer.from("not an audio file"),
                            preset: "default",
                            mediaType: "audio",
                            languageId: "lang-eng",
                        },
                    ],
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("isAudio");
    });
});
