import { createHash } from "crypto";

/**
 * XOR `keyHex` with SHA-256(seed)[0..15], repeated over the key so any key length works.
 * Self-inverse: applying it twice returns the input,
 * so this is both the mask (API write path) and the unmask (client read path, browser copy).
 *
 * Deliberate duplication of `shared/src/util/unmaskKeyHex.ts` — the API cannot import from
 * shared. The shared test vector in both specs catches divergence.
 * Seed is the sidecar `_id`; the mask is obscurity, not a secret (see ADR 0019,
 * docs/adr/0019-hls-encryption-keys-as-non-replicated-sidecars.md).
 */
export function maskKeyHex(seed: string, keyHex: string): string {
    // Buffer.from silently drops what it cannot parse, which would store a different key.
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(keyHex)) {
        throw new Error("The HLS key must be a hex string of whole bytes");
    }
    const mask = createHash("sha256").update(seed).digest().subarray(0, 16);
    const key = Buffer.from(keyHex, "hex");
    return Buffer.from(key.map((byte, i) => byte ^ mask[i % mask.length])).toString("hex");
}