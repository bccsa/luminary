import { describe, it, expect } from "vitest";
import { unmaskKeyHex } from "./unmaskKeyHex";

describe("unmaskKeyHex", () => {
    // Shared test vector — the same (seed, key) → masked literal is asserted in
    // api/src/util/maskKey.spec.ts and cms/src/util/mediaEncoder.spec.ts. A
    // divergence between the implementations fails a test here rather than a
    // video in the player.
    it("matches the shared test vector", async () => {
        const seed = "sidecar-post-abc-hlsEncryptionKey";
        const keyHex = "000102030405060708090a0b0c0d0e0f";

        expect(await unmaskKeyHex(seed, "98ceb55553113bf2fdd5a74b3fa6e8d8")).toBe(keyHex);
    });

    it("is its own inverse, so unmasking twice returns the input", async () => {
        const seed = "session-xyz";
        const keyHex = "ffeeddccbbaa99887766554433221100";

        const once = await unmaskKeyHex(seed, keyHex);
        expect(await unmaskKeyHex(seed, once)).toBe(keyHex);
    });

    it("produces a different result for a different seed", async () => {
        const masked = "0f0e0d0c0b0a09080706050403020100";

        expect(await unmaskKeyHex("seed-a", masked)).not.toBe(await unmaskKeyHex("seed-b", masked));
    });
});
