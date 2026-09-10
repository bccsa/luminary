import { DbService } from "../../db/db.service";
import { PostDto } from "../../dto/PostDto";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { MediaDto } from "../../dto/MediaDto";
import { createTestingModule } from "../../test/testingModule";
import { PermissionSystem } from "../../permissions/permissions.service";
import { processChangeRequest } from "../processChangeRequest";
import { changeRequest_content } from "../../test/changeRequestDocuments";
import { DocType, SidecarType } from "../../enums";
import { sidecarId, deleteSidecarsForParent } from "../../sidecar/sidecar.service";
import { getHlsKeySidecar } from "../../sidecar/hlsEncryptionKey";
import { maskKeyHex } from "../../util/maskKey";

// Unmocked counterpart to processPostTagDto.spec.ts: these tests round-trip through
// the real processMedia write path, which the mocked spec cannot exercise. Covers
// sidecar lifecycle and deletion (ADR 0019).

const HLS_URL = "https://cdn.example.com/media/master.m3u8";
const KEY_A = "0123456789abcdef0123456789abcdef";
const KEY_B = "fedcba9876543210fedcba9876543210";

const PARENT_IDS = [
    "post-del-with-key",
    "post-del-no-key",
    "post-clear-key",
    "post-remove-media",
    "post-write-wins",
    "post-overwrite",
    "post-unrelated-save",
    "post-content-delete",
];

function postCr(id: string, media?: MediaDto): ChangeReqDto {
    const doc: PostDto = {
        _id: id,
        type: DocType.Post,
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
        image: `img-${id}`,
    } as PostDto;
    if (media) {
        doc.media = media;
        doc.mediaBucketId = "media-bucket";
    }
    return { doc };
}

describe("processPostTagDto — sidecar lifecycle", () => {
    let db: DbService;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-post-tag-dto-sidecar");
        db = testingModule.dbService;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
    });

    afterEach(async () => {
        for (const id of PARENT_IDS) {
            await deleteSidecarsForParent(db, id);
        }
    });

    it("deletes a Post's key sidecar when the Post is deleted", async () => {
        const id = "post-del-with-key";
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );
        expect(await getHlsKeySidecar(db, id)).toBeDefined();

        const del = postCr(id);
        del.doc.deleteReq = 1;
        await processChangeRequest("test-user", del, ["group-super-admins"], db);

        expect((await db.getDoc(id)).docs).toHaveLength(0);
        expect(await getHlsKeySidecar(db, id)).toBeUndefined();
    });

    it("deletes a Post with no sidecar and warns nothing about sidecars", async () => {
        const id = "post-del-no-key";
        // No hlsKey submitted → no sidecar is written.
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL }),
            ["group-super-admins"],
            db,
        );

        const del = postCr(id);
        del.doc.deleteReq = 1;
        const result = await processChangeRequest("test-user", del, ["group-super-admins"], db);

        expect(result.result.ok).toBe(true);
        expect((result.warnings ?? []).filter((w) => w.includes("sidecar"))).toEqual([]);
        expect((await db.getDoc(id)).docs).toHaveLength(0);
    });

    it("removes the sidecar when the key field is cleared", async () => {
        const id = "post-clear-key";
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );
        expect(await getHlsKeySidecar(db, id)).toBeDefined();

        // Key field cleared: media present, no hlsKey_id, no hlsKey.
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL }),
            ["group-super-admins"],
            db,
        );

        expect(await getHlsKeySidecar(db, id)).toBeUndefined();
        const post = (await db.getDoc(id)).docs[0] as PostDto;
        expect(post.media?.hlsKey_id).toBeUndefined();
    });

    it("removes the sidecar when the whole media object is removed", async () => {
        const id = "post-remove-media";
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );
        expect(await getHlsKeySidecar(db, id)).toBeDefined();

        // No media at all — the case a check inside processMedia (gated on
        // doc.media) would never see, which is why the removal check lives here.
        await processChangeRequest("test-user", postCr(id), ["group-super-admins"], db);

        expect(await getHlsKeySidecar(db, id)).toBeUndefined();
    });

    it("keeps the new key when a change request both drops hlsKey_id and submits a fresh hlsKey", async () => {
        const id = "post-write-wins";
        const seed = sidecarId(id, SidecarType.HlsEncryptionKey);
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );

        // hlsKey_id absent (would trigger deletion) but a fresh hlsKey is present —
        // processMedia rewrites the sidecar first, so the write wins over the delete.
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_B }),
            ["group-super-admins"],
            db,
        );

        const stored = await getHlsKeySidecar(db, id);
        expect(stored).toBeDefined();
        expect(stored!.maskedKeyHex).toBe(maskKeyHex(seed, KEY_B));
        expect(stored!.maskedKeyHex).not.toBe(maskKeyHex(seed, KEY_A));
    });

    it("overwrites in place: a new key over an old one leaves one sidecar at the same id", async () => {
        const id = "post-overwrite";
        const seed = sidecarId(id, SidecarType.HlsEncryptionKey);
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );
        const firstId = ((await db.getDoc(id)).docs[0] as PostDto).media!.hlsKey_id;

        // Second save carries the old hlsKey_id and a new hlsKey — replace, not append.
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey_id: firstId, hlsKey: KEY_B }),
            ["group-super-admins"],
            db,
        );

        const stored = await getHlsKeySidecar(db, id);
        expect(stored!.maskedKeyHex).toBe(maskKeyHex(seed, KEY_B));
        // Deterministic id → exactly one document, not two.
        expect((await db.getDoc(seed)).docs).toHaveLength(1);
    });

    it("leaves the sidecar untouched when saving an unrelated field on a Post that has a key", async () => {
        const id = "post-unrelated-save";
        const seed = sidecarId(id, SidecarType.HlsEncryptionKey);
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );
        const before = await getHlsKeySidecar(db, id);
        expect(before).toBeDefined();

        // Re-save carrying the existing hlsKey_id, changing only an unrelated field.
        // Regression guard (ADR 0019): if hlsKey_id were not @Expose'd,
        // instanceToPlain would drop it on write and the "reference disappeared"
        // condition would delete the key on every unrelated save.
        const update = postCr(id, { hlsUrl: HLS_URL, hlsKey_id: seed });
        update.doc.showComingSoon = true;
        await processChangeRequest("test-user", update, ["group-super-admins"], db);

        const after = await getHlsKeySidecar(db, id);
        expect(after).toBeDefined();
        expect(after!.maskedKeyHex).toBe(before!.maskedKeyHex);
        const post = (await db.getDoc(id)).docs[0] as PostDto;
        expect(post.media?.hlsKey_id).toBe(seed);
    });

    it("does not touch the Post's sidecar when a child Content translation is deleted", async () => {
        const id = "post-content-delete";
        await processChangeRequest(
            "test-user",
            postCr(id, { hlsUrl: HLS_URL, hlsKey: KEY_A }),
            ["group-super-admins"],
            db,
        );
        expect(await getHlsKeySidecar(db, id)).toBeDefined();

        const content = changeRequest_content();
        content.doc._id = "content-del-translation";
        content.doc.parentId = id;
        content.doc.language = "lang-eng";
        await processChangeRequest("test-user", content, ["group-super-admins"], db);

        const delContent = JSON.parse(JSON.stringify(content)) as ChangeReqDto;
        delContent.doc.deleteReq = 1;
        await processChangeRequest("test-user", delContent, ["group-super-admins"], db);

        expect((await db.getDoc("content-del-translation")).docs).toHaveLength(0);
        // Sidecars hang off the Post/Tag, not Content — a translation delete must not
        // reach the key.
        expect(await getHlsKeySidecar(db, id)).toBeDefined();
    });
});