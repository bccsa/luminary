import { maskKeyHex } from "./maskKey";

describe("maskKeyHex", () => {
    // Shared test vector — the same (seed, key) → masked literal is asserted in
    // cms/src/util/mediaEncoder.spec.ts and shared/src/util/unmaskKeyHex.spec.ts. A
    // divergence between the implementations fails a test here rather than a video
    // in the player.
    it("matches the shared test vector", () => {
        const seed = "sidecar-post-abc-hlsEncryptionKey";
        const keyHex = "000102030405060708090a0b0c0d0e0f";

        expect(maskKeyHex(seed, keyHex)).toBe("98ceb55553113bf2fdd5a74b3fa6e8d8");
    });

    it("is its own inverse, so masking twice returns the input", () => {
        const seed = "session-xyz";
        const keyHex = "ffeeddccbbaa99887766554433221100";

        const once = maskKeyHex(seed, keyHex);
        expect(maskKeyHex(seed, once)).toBe(keyHex);
    });

    it("produces a different key for a different seed, so keys cannot be crossed", () => {
        const keyHex = "0f0e0d0c0b0a09080706050403020100";
        const masked = maskKeyHex("seed-a", keyHex);

        expect(maskKeyHex("seed-b", masked)).not.toBe(keyHex);
    });

    it("returns 16 bytes (32 hex chars) for a 16-byte key", () => {
        const keyHex = "112233445566778899aabbccddeeff00";

        expect(maskKeyHex("s", keyHex)).toHaveLength(32);
    });

    it("masks a key of any length, repeating the mask past 16 bytes", () => {
        const short = "0011223344556677";
        const long = "00112233445566778899aabbccddeeff".repeat(2);

        expect(maskKeyHex("s", maskKeyHex("s", short))).toBe(short);
        expect(maskKeyHex("s", maskKeyHex("s", long))).toBe(long);
        // Both halves of the long key use the same mask bytes.
        const masked = maskKeyHex("s", long);
        expect(masked.slice(32)).toBe(masked.slice(0, 32));
    });

    it("rejects input that is not whole bytes of hex, rather than storing a different key", () => {
        expect(() => maskKeyHex("s", "abc")).toThrow(/hex/);
        expect(() => maskKeyHex("s", "zz".repeat(16))).toThrow(/hex/);
        expect(() => maskKeyHex("s", "")).toThrow(/hex/);
    });
});