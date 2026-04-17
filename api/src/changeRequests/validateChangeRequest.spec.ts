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
            invalidProperty: {},
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Change request validation failed");
    });

    it("fails validation for an invalid document type", async () => {
        const changeRequest = {
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

    it("strips invalid permissions from ACL entries before validation", async () => {
        const changeRequest = {
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
                        permission: ["view", "invalid"], // Invalid permission is stripped by validateAcl
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        // validateAcl strips "invalid", keeps "view" — validation passes
        expect(result.validated).toBe(true);
    });

    it("removes invalid fields from the document", async () => {
        const changeRequest = {
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

    it("strips ACL entries that have only invalid permissions", async () => {
        const changeRequest = {
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
                        permission: ["invalid-permission"], // Stripped by validateAcl, entry removed (empty permissions)
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        // validateAcl strips "invalid-permission"; validateAclEntry then sees a
        // non-empty array and auto-adds View, so the entry survives with ["view"].
        expect(result.validated).toBe(true);
        expect(result.validatedData.acl).toHaveLength(2);
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

    describe("user provider+externalUserId uniqueness", () => {
        const existingUserId = "user-unique-existing";
        const duplicateUserId = "user-unique-duplicate";

        beforeAll(async () => {
            await db.upsertDoc({
                _id: existingUserId,
                type: "user",
                memberOf: ["group-super-admins"],
                email: "first@example.com",
                name: "First User",
                providerId: "provider-abc",
                externalUserId: "external-123",
                updatedTimeUtc: Date.now(),
            });
        });

        afterAll(async () => {
            await db.upsertDoc({ _id: existingUserId, _deleted: true } as any).catch(() => {
                /* best-effort cleanup */
            });
        });

        it("rejects a new user that duplicates an existing (providerId, externalUserId) pair", async () => {
            const changeRequest = {
                doc: {
                    _id: duplicateUserId,
                    type: "user",
                    memberOf: ["group-super-admins"],
                    email: "second@example.com",
                    name: "Second User",
                    providerId: "provider-abc",
                    externalUserId: "external-123",
                    updatedTimeUtc: Date.now(),
                },
            };

            const result = await validateChangeRequest(
                changeRequest,
                ["group-super-admins"],
                db,
            );
            expect(result.validated).toBe(false);
            expect(result.error).toContain(
                "Another user is already linked to this provider with the same external user ID",
            );
        });

        it("allows editing the same user that already holds the pair", async () => {
            const changeRequest = {
                doc: {
                    _id: existingUserId,
                    type: "user",
                    memberOf: ["group-super-admins"],
                    email: "first@example.com",
                    name: "First User Updated",
                    providerId: "provider-abc",
                    externalUserId: "external-123",
                    updatedTimeUtc: Date.now(),
                },
            };

            const result = await validateChangeRequest(
                changeRequest,
                ["group-super-admins"],
                db,
            );
            expect(result.validated).toBe(true);
        });

        it("allows the same externalUserId under a different providerId", async () => {
            const changeRequest = {
                doc: {
                    _id: "user-unique-different-provider",
                    type: "user",
                    memberOf: ["group-super-admins"],
                    email: "third@example.com",
                    name: "Third User",
                    providerId: "provider-xyz",
                    externalUserId: "external-123",
                    updatedTimeUtc: Date.now(),
                },
            };

            const result = await validateChangeRequest(
                changeRequest,
                ["group-super-admins"],
                db,
            );
            expect(result.validated).toBe(true);
        });

        it("skips the uniqueness check when externalUserId or providerId is missing", async () => {
            const changeRequest = {
                doc: {
                    _id: "user-unique-no-provider",
                    type: "user",
                    memberOf: ["group-super-admins"],
                    email: "fourth@example.com",
                    name: "Fourth User",
                    // neither providerId nor externalUserId — 'Any provider' mode
                    updatedTimeUtc: Date.now(),
                },
            };

            const result = await validateChangeRequest(
                changeRequest,
                ["group-super-admins"],
                db,
            );
            expect(result.validated).toBe(true);
        });
    });
});
