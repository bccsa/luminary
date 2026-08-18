import "reflect-metadata";
import { createTestingModule } from "../test/testingModule";
import { DbService } from "../db/db.service";
import { DocType, SidecarType } from "../enums";
import { PostDto } from "../dto/PostDto";
import { DeleteCmdDto } from "../dto/DeleteCmdDto";
import {
    deleteSidecar,
    deleteSidecarsForParent,
    getSidecar,
    sidecarId,
    syncSidecarMemberOf,
    upsertSidecar,
} from "./sidecar.service";
import { getHlsKeySidecar, isHlsEncryptionKeyData, upsertHlsKeySidecar } from "./hlsEncryptionKey";

// Pure unit tests for the key guard and ID scheme — no DB, runnable by anyone.
describe("sidecar (pure unit)", () => {
    describe("sidecarId", () => {
        it("is deterministic and shaped sidecar-<parentId>-<sidecarType>", () => {
            expect(sidecarId("post-abc", SidecarType.HlsEncryptionKey)).toBe(
                "sidecar-post-abc-hlsEncryptionKey",
            );
        });

        it("is stable across calls for the same inputs", () => {
            expect(sidecarId("post-abc", SidecarType.HlsEncryptionKey)).toBe(
                sidecarId("post-abc", SidecarType.HlsEncryptionKey),
            );
        });
    });

    describe("isHlsEncryptionKeyData", () => {
        it("accepts a 32-char lowercase hex maskedKeyHex", () => {
            expect(isHlsEncryptionKeyData({ maskedKeyHex: "0123456789abcdef0123456789abcdef" })).toBe(
                true,
            );
        });

        it("rejects a hex string of the wrong length", () => {
            expect(isHlsEncryptionKeyData({ maskedKeyHex: "0123456789abcdef" })).toBe(false);
            expect(isHlsEncryptionKeyData({ maskedKeyHex: "0".repeat(33) })).toBe(false);
        });

        it("rejects uppercase hex", () => {
            expect(isHlsEncryptionKeyData({ maskedKeyHex: "AB".repeat(16) })).toBe(false);
        });

        it("rejects non-hex characters", () => {
            expect(isHlsEncryptionKeyData({ maskedKeyHex: "z".repeat(32) })).toBe(false);
        });

        it("rejects a non-string maskedKeyHex", () => {
            expect(isHlsEncryptionKeyData({ maskedKeyHex: 123 })).toBe(false);
        });

        it("rejects undefined / null / missing field", () => {
            expect(isHlsEncryptionKeyData(undefined)).toBe(false);
            expect(isHlsEncryptionKeyData(null)).toBe(false);
            expect(isHlsEncryptionKeyData({})).toBe(false);
        });
    });
});

// DB-dependent tests — require a running CouchDB, so the user runs them.
// `npm test -- src/sidecar/sidecar.service.spec.ts`
describe("sidecar.service (CouchDB)", () => {
    let db: DbService;

    beforeAll(async () => {
        db = (await createTestingModule("sidecar")).dbService;
    });

    function makePost(overrides: Partial<PostDto> = {}): PostDto {
        return {
            _id: "post-test",
            type: DocType.Post,
            memberOf: ["group-test"],
            updatedBy: "user-test",
            postType: "blog" as any,
            ...overrides,
        } as PostDto;
    }

    describe("upsertSidecar", () => {
        afterEach(async () => {
            await deleteSidecarsForParent(db, "post-test");
        });

        it("writes a doc with the deterministic _id and the parent's memberOf", async () => {
            const parent = makePost({ memberOf: ["group-a", "group-b"] });
            const id = await upsertSidecar(db, parent, SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "0".repeat(32),
            });

            expect(id).toBe(sidecarId("post-test", SidecarType.HlsEncryptionKey));

            const stored = await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey);
            expect(stored).toBeDefined();
            expect(stored!.type).toBe(DocType.Sidecar);
            expect(stored!.parentId).toBe("post-test");
            expect(stored!.parentType).toBe(DocType.Post);
            expect(stored!.sidecarType).toBe(SidecarType.HlsEncryptionKey);
            expect([...stored!.memberOf].sort()).toEqual(["group-a", "group-b"]);
            expect(stored!.updatedBy).toBe("user-test");
        });

        it("replaces rather than duplicates on a second write for the same parent+type", async () => {
            const parent = makePost();
            await upsertSidecar(db, parent, SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "1".repeat(32),
            });
            await upsertSidecar(db, parent, SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "2".repeat(32),
            });

            const stored = await getHlsKeySidecar(db, "post-test");
            expect(stored).toBeDefined();
            expect(stored!.maskedKeyHex).toBe("2".repeat(32));

            // Deterministic id → exactly one document, not two.
            const res = await db.getDoc(sidecarId("post-test", SidecarType.HlsEncryptionKey));
            expect(res.docs).toHaveLength(1);
        });

    });

    describe("getSidecar", () => {
        afterEach(async () => {
            await deleteSidecarsForParent(db, "post-test");
        });

        it("returns undefined for an absent sidecar", async () => {
            expect(await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey)).toBeUndefined();
        });
    });

    describe("getHlsKeySidecar", () => {
        afterEach(async () => {
            await deleteSidecarsForParent(db, "post-test");
        });

        it("throws on a corrupt payload (guard fails)", async () => {
            // Write a sidecar with a bad payload directly through the generic core,
            // bypassing the typed wrapper, to simulate a corrupt/incompatible doc.
            await upsertSidecar(db, makePost(), SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "not-valid-hex",
            });

            await expect(getHlsKeySidecar(db, "post-test")).rejects.toThrow(/Corrupt/);
        });
    });

    describe("deleteSidecarsForParent", () => {
        it("removes every sidecar of a parent", async () => {
            await upsertSidecar(db, makePost(), SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "0".repeat(32),
            });
            await deleteSidecarsForParent(db, "post-test");
            expect(await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey)).toBeUndefined();
        });

        it("is a no-op when no sidecar exists", async () => {
            await expect(deleteSidecarsForParent(db, "post-absent")).resolves.toBeUndefined();
        });
    });

    describe("deleteSidecar", () => {
        it("removes one sidecar by parent+type", async () => {
            await upsertSidecar(db, makePost(), SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "0".repeat(32),
            });
            await deleteSidecar(db, "post-test", SidecarType.HlsEncryptionKey);
            expect(await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey)).toBeUndefined();
        });
    });

    describe("syncSidecarMemberOf", () => {
        afterEach(async () => {
            await deleteSidecarsForParent(db, "post-test");
        });

        it("updates a sidecar's memberOf when the parent's memberOf changes", async () => {
            await upsertSidecar(db, makePost({ memberOf: ["group-a"] }), SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "0".repeat(32),
            });

            await syncSidecarMemberOf(db, makePost({ memberOf: ["group-a", "group-b"] }));

            const stored = await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey);
            expect([...stored!.memberOf].sort()).toEqual(["group-a", "group-b"]);
        });

        it("does not churn the sidecar when memberOf is unchanged", async () => {
            await upsertSidecar(db, makePost({ memberOf: ["group-a"] }), SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "0".repeat(32),
            });
            const before = await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey);
            const revBefore = before!._rev;

            // Same memberOf → no rewrite.
            await syncSidecarMemberOf(db, makePost({ memberOf: ["group-a"] }));

            const after = await getSidecar(db, "post-test", SidecarType.HlsEncryptionKey);
            expect(after!._rev).toBe(revBefore);
        });

        it("produces no DeleteCmd with docType 'sidecar' on a memberOf change", async () => {
            await upsertSidecar(db, makePost({ memberOf: ["group-a"] }), SidecarType.HlsEncryptionKey, {
                maskedKeyHex: "0".repeat(32),
            });

            await syncSidecarMemberOf(db, makePost({ memberOf: ["group-a", "group-b"] }));

            const allDocs = await db.getDocsByType(DocType.DeleteCmd);
            const sidecarDeleteCmds = allDocs.docs.filter(
                (d) => (d as DeleteCmdDto).docType === DocType.Sidecar,
            );
            expect(sidecarDeleteCmds).toHaveLength(0);
        });
    });
});