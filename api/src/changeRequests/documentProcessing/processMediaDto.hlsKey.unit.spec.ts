import { processMedia } from "./processMediaDto";
import { upsertHlsKeySidecar } from "../../sidecar/hlsEncryptionKey";
import { DbService } from "../../db/db.service";
import { MediaDto } from "../../dto/MediaDto";
import { PostDto } from "../../dto/PostDto";

jest.mock("../../sidecar/hlsEncryptionKey", () => ({ upsertHlsKeySidecar: jest.fn() }));

const HLS = "https://cdn.elsewhere.example.com/abc/master.m3u8";

const stubDb = () =>
    ({ getDoc: jest.fn().mockResolvedValue({ docs: [] }) }) as unknown as DbService;

const post = (media: MediaDto) =>
    ({
        _id: "post-1",
        type: "post",
        memberOf: ["group-public-content"],
        media,
    }) as unknown as PostDto;

describe("processMedia with a submitted hlsKey", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (upsertHlsKeySidecar as jest.Mock).mockResolvedValue("sidecar-post-1-hlsEncryptionKey");
    });

    it("stores a key of any whole number of bytes", async () => {
        const media = { hlsUrl: HLS, hlsKey: "0011223344556677" } as MediaDto;

        await processMedia(media, post(media), stubDb());

        expect(upsertHlsKeySidecar).toHaveBeenCalledTimes(1);
        expect(media.hlsKey_id).toBe("sidecar-post-1-hlsEncryptionKey");
        expect(media).not.toHaveProperty("hlsKey");
    });

    it.each([["not-valid-hex"], ["abc"], ["1234 "]])(
        "fails the request for a key that is not whole bytes of hex (%j)",
        async (hlsKey) => {
            // Validation converts plain values to strings, so masking is where a
            // malformed key has to be caught before a different key is stored.
            const media = { hlsUrl: HLS, hlsKey } as MediaDto;

            await expect(processMedia(media, post(media), stubDb())).rejects.toThrow(
                /Failed to store the HLS key/,
            );
            expect(upsertHlsKeySidecar).not.toHaveBeenCalled();
            expect(media).not.toHaveProperty("hlsKey");
            expect(media).not.toHaveProperty("hlsKey_id");
        },
    );
});
