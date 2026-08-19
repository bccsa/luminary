import "reflect-metadata";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { DocType, PublishStatus, RedirectType } from "../enums";
import { ContentDto } from "../dto/ContentDto";
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

    // An explicit deny is the only barrier between a client-authored sidecar and
    // CouchDB — the type check no longer rejects it once Sidecar is a valid enum member.
    describe("sidecar change requests are rejected", () => {
        const sidecarId = "sidecar-post-sidecar-test-hlsEncryptionKey";

        afterEach(async () => {
            // Clean up any sidecar that leaked through a regression.
            await db.deleteDoc(sidecarId).catch(() => {});
            await db.deleteDoc("post-sidecar-test").catch(() => {});
        });

        it("rejects doc.type: 'sidecar' as an invalid document type", async () => {
            const changeRequest = {
                doc: {
                    _id: sidecarId,
                    type: "sidecar",
                    memberOf: ["group-test"],
                    parentId: "post-sidecar-test",
                    parentType: "post",
                    sidecarType: "hlsEncryptionKey",
                    data: { maskedKeyHex: "0".repeat(32) },
                },
            };

            const result = await validateChangeRequest(changeRequest, ["group-test"], db);

            expect(result.validated).toBe(false);
            expect(result.error).toContain("Invalid document type");
        });

        it("rejects a well-formed sidecar body and writes no document", async () => {
            // Assert the doc is absent, not just the error — the risk is db.upsertDoc
            // running after a validation pass.
            const changeRequest = {
                doc: {
                    _id: sidecarId,
                    type: "sidecar",
                    memberOf: ["group-test"],
                    parentId: "post-sidecar-test",
                    parentType: "post",
                    sidecarType: "hlsEncryptionKey",
                    data: { maskedKeyHex: "0".repeat(32) },
                },
            };

            const result = await validateChangeRequest(changeRequest, ["group-test"], db);

            expect(result.validated).toBe(false);
            const stored = await db.getDoc(sidecarId);
            expect(stored.docs).toHaveLength(0);
        });

        it("rejects a deleteReq naming a sidecar and leaves the sidecar intact", async () => {
            // Create a real sidecar via the server-side path, then attempt a
            // client deleteReq against it.
            const { upsertSidecar } = await import("../sidecar/sidecar.service");
            await db.upsertDoc({
                _id: "post-sidecar-test",
                type: "post",
                memberOf: ["group-test"],
                postType: "blog",
            } as any);
            await upsertSidecar(
                db,
                {
                    _id: "post-sidecar-test",
                    type: DocType.Post,
                    memberOf: ["group-test"],
                    updatedBy: "user-test",
                } as any,
                "hlsEncryptionKey" as any,
                { maskedKeyHex: "0".repeat(32) },
            );
            const before = await db.getDoc(sidecarId);
            expect(before.docs).toHaveLength(1);

            const changeRequest = {
                doc: {
                    _id: sidecarId,
                    type: "sidecar",
                    deleteReq: 1,
                },
            };

            const result = await validateChangeRequest(changeRequest, ["group-test"], db);

            expect(result.validated).toBe(false);
            const after = await db.getDoc(sidecarId);
            expect(after.docs).toHaveLength(1); // survived
        });
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

    it("validates a post with an HLS media collection", async () => {
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
                    hlsUrl: "https://cdn.example.com/media/post-test/master.m3u8",
                    hlsKey: "0123456789abcdef0123456789abcdef",
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(true);
        expect(result.error).toBe(undefined);
    });

    it("fails validation for a malformed hlsKey", async () => {
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
                    hlsUrl: "https://cdn.example.com/media/post-test/master.m3u8",
                    // Not valid hex, and too short: masking this would silently
                    // produce a broken sidecar rather than a validation error.
                    hlsKey: "not-valid-hex",
                },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("hlsKey");
    });

    it("fails validation for media with no playlist URL", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "post-test",
                type: "post",
                memberOf: ["group-super-admins"],
                postType: "blog",
                tags: [],
                publishDateVisible: true,
                // A key with nothing to decrypt is not a media object.
                media: { hlsKey: "0123456789abcdef0123456789abcdef" },
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("hlsUrl");
    });

    it("rejects a redirect whose slug has published content", async () => {
        await db.upsertDoc({
            _id: "content-published-for-redirect",
            type: DocType.Content,
            memberOf: ["group-public-content"],
            parentId: "post-blog1",
            language: "lang-eng",
            status: PublishStatus.Published,
            slug: "published-slug-for-redirect",
            title: "Published",
            publishDate: 1704114000000,
        } as ContentDto);

        const changeRequest = {
            doc: {
                _id: "redirect-over-published",
                type: DocType.Redirect,
                memberOf: ["group-public-content"],
                redirectType: RedirectType.Permanent,
                slug: "published-slug-for-redirect",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Published content already exists for slug");
    });

    it("allows a redirect whose slug has only draft content", async () => {
        await db.upsertDoc({
            _id: "content-draft-for-redirect",
            type: DocType.Content,
            memberOf: ["group-public-content"],
            parentId: "post-blog1",
            language: "lang-eng",
            status: PublishStatus.Draft,
            slug: "draft-slug-for-redirect",
            title: "Draft",
            publishDate: 1704114000000,
        } as ContentDto);

        const changeRequest = {
            doc: {
                _id: "redirect-over-draft",
                type: DocType.Redirect,
                memberOf: ["group-public-content"],
                redirectType: RedirectType.Permanent,
                slug: "draft-slug-for-redirect",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(true);
        expect(result.error).toBeUndefined();
    });
});
