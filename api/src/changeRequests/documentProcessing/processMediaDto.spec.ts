import { processMedia } from "./processMediaDto";
import { createTestingModule } from "../../test/testingModule";
import { MediaDto } from "../../dto/MediaDto";
import { DbService } from "../../db/db.service";
import { retrieveCryptoData } from "../../util/encryption";

const HLS_URL = "https://cdn.example.com/media/post-1/master.m3u8";
const HLS_KEY = "0123456789abcdef0123456789abcdef";

describe("processMediaDto", () => {
    let db: DbService;

    beforeAll(async () => {
        const module = await createTestingModule("process-media-dto");
        db = module.dbService;
    });

    it("stores a submitted HLS key as a crypto object and keeps only the reference", async () => {
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };

        const warnings = await processMedia(media, db);

        expect(warnings).toEqual([]);
        expect(media.hlsKey_id).toBeDefined();
        // The key itself must not survive onto the document.
        expect(media.hlsKey).toBeUndefined();
        expect(media.hlsUrl).toBe(HLS_URL);
    });

    it("stores a key that can be read back and decrypted", async () => {
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };

        await processMedia(media, db);

        await expect(retrieveCryptoData<string>(db, media.hlsKey_id!)).resolves.toBe(HLS_KEY);
    });

    it("gives each submission its own crypto object", async () => {
        const first: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };
        const second: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };

        await processMedia(first, db);
        await processMedia(second, db);

        expect(first.hlsKey_id).not.toBe(second.hlsKey_id);
    });

    it("leaves an unencrypted collection alone", async () => {
        const media: MediaDto = { hlsUrl: HLS_URL };

        const warnings = await processMedia(media, db);

        expect(warnings).toEqual([]);
        expect(media.hlsKey_id).toBeUndefined();
    });

    it("keeps an existing key reference when no new key is submitted", async () => {
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey_id: "crypto-existing" };

        await processMedia(media, db);

        expect(media.hlsKey_id).toBe("crypto-existing");
    });

    it("drops the key rather than persisting it in plain text when storing fails", async () => {
        const media: MediaDto = { hlsUrl: HLS_URL, hlsKey: HLS_KEY };
        const failingDb = {
            upsertDoc: () => Promise.reject(new Error("database unavailable")),
        } as unknown as DbService;

        await expect(processMedia(media, failingDb)).rejects.toThrow(
            /Failed to encrypt the HLS key/,
        );

        // The whole point of the finally: a key that could not be encrypted must
        // not reach the document by way of the caller's error handling.
        expect(media.hlsKey).toBeUndefined();
        expect(media.hlsKey_id).toBeUndefined();
    });
});
