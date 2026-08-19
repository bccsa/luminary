import { processMedia } from "./processMediaDto";
import { createTestingModule } from "../../test/testingModule";
import { MediaDto } from "../../dto/MediaDto";
import { PostDto } from "../../dto/PostDto";
import { DbService } from "../../db/db.service";
import { DocType, SidecarType } from "../../enums";
import { maskKeyHex } from "../../util/maskKey";
import { sidecarId, getSidecar, deleteSidecarsForParent } from "../../sidecar/sidecar.service";
import { getHlsKeySidecar } from "../../sidecar/hlsEncryptionKey";

const HLS_URL = "https://cdn.example.com/media/post-1/master.m3u8";
const HLS_KEY = "0123456789abcdef0123456789abcdef";

function makePost(id: string): PostDto {
    return {
        _id: id,
        type: DocType.Post,
        memberOf: ["group-public-content"],
        updatedBy: "user-test",
        postType: "blog" as any,
    } as PostDto;
}

describe("processMediaDto", () => {
    let db: DbService;

    beforeAll(async () => {
        const module = await createTestingModule("process-media-dto");
        db = module.dbService;
    });

    afterEach(async () => {
        // Clean up the sidecars each test writes (deterministic ids per parent).
        for (const id of ["post-store", "post-readback", "post-same", "post-a", "post-b"]) {
            await deleteSidecarsForParent(db, id);
        }
    });

    it("stores a submitted HLS key as a masked sidecar and keeps only the reference", async () => {
        const parent = makePost("post-store");
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };

        const warnings = await processMedia(media, parent, db);

        expect(warnings).toEqual([]);
        // hlsKey_id is the deterministic sidecar id, not a random crypto-doc id.
        expect(media.hlsKey_id).toBe(sidecarId(parent._id, SidecarType.HlsEncryptionKey));
        // The plaintext key must not survive onto the document.
        expect(media.hlsKey).toBeUndefined();
        expect(media.hlsUrl).toBe(HLS_URL);
    });

    it("stores a key that can be read back masked, not plaintext, and not as a crypto envelope", async () => {
        const parent = makePost("post-readback");
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };

        await processMedia(media, parent, db);

        const stored = await getHlsKeySidecar(db, parent._id);
        expect(stored).toBeDefined();

        const seed = sidecarId(parent._id, SidecarType.HlsEncryptionKey);
        // Masked: equals maskKeyHex(seed, key), and is not the raw key.
        expect(stored!.maskedKeyHex).toBe(maskKeyHex(seed, HLS_KEY));
        expect(stored!.maskedKeyHex).not.toBe(HLS_KEY);

        // Regression guard (docs/sidecar/07): the stored payload is a sidecar, not a
        // CryptoDto envelope — there is no `data.encrypted` AES-256-CBC blob.
        const raw = await getSidecar(db, parent._id, SidecarType.HlsEncryptionKey);
        expect(raw!.type).toBe(DocType.Sidecar);
        expect(raw!.data).not.toHaveProperty("encrypted");
    });

    it("is idempotent per parent: the same parent gets the same sidecar id, replaced not duplicated", async () => {
        const parent = makePost("post-same");
        const first: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };
        const second: MediaDto = { hlsUrl: HLS_URL, hlsKey: "fedcba9876543210fedcba9876543210" };

        await processMedia(first, parent, db);
        const firstId = first.hlsKey_id;
        await processMedia(second, parent, db);

        // Deterministic id → same id, not a new document each time.
        expect(second.hlsKey_id).toBe(firstId);

        // And the stored payload is the second key (replace, not append).
        const stored = await getHlsKeySidecar(db, parent._id);
        const seed = sidecarId(parent._id, SidecarType.HlsEncryptionKey);
        expect(stored!.maskedKeyHex).toBe(maskKeyHex(seed, "fedcba9876543210fedcba9876543210"));

        const res = await db.getDoc(sidecarId(parent._id, SidecarType.HlsEncryptionKey));
        expect(res.docs).toHaveLength(1);
    });

    it("gives different parents different sidecar ids", async () => {
        const a = makePost("post-a");
        const b = makePost("post-b");
        const mediaA: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };
        const mediaB: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };

        await processMedia(mediaA, a, db);
        await processMedia(mediaB, b, db);

        expect(mediaA.hlsKey_id).not.toBe(mediaB.hlsKey_id);
    });

    it("leaves an unencrypted collection alone", async () => {
        const parent = makePost("post-store");
        const media: MediaDto = { hlsUrl: HLS_URL };

        const warnings = await processMedia(media, parent, db);

        expect(warnings).toEqual([]);
        expect(media.hlsKey_id).toBeUndefined();
    });

    it("keeps an existing key reference when no new key is submitted", async () => {
        const parent = makePost("post-store");
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey_id: "sidecar-existing" };

        await processMedia(media, parent, db);

        expect(media.hlsKey_id).toBe("sidecar-existing");
    });

    it("drops the key rather than persisting it in plain text when storing fails", async () => {
        const parent = makePost("post-store");
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };
        const failingDb = {
            upsertDoc: () => Promise.reject(new Error("database unavailable")),
        } as unknown as DbService;

        await expect(processMedia(media, parent, failingDb)).rejects.toThrow(
            /Failed to store the HLS key/,
        );

        // The whole point of the finally: a key that could not be stored must
        // not reach the document by way of the caller's error handling.
        expect(media.hlsKey).toBeUndefined();
        expect(media.hlsKey_id).toBeUndefined();
    });
});