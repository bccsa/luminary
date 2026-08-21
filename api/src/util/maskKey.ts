import { createHash } from "crypto";

/**
 * XOR `keyHex` with SHA-256(seed)[0..15]. Self-inverse: applying it twice returns the input,
 * so this is both the mask (API write path) and the unmask (client read path, browser copy).
 *
 * Deliberate duplication of `cms/src/util/mediaEncoder.ts` `unmaskKeyHex` — the API cannot
 * import from shared/cms. The shared test vector in both specs catches divergence.
 * Seed is the sidecar `_id`; the mask is obscurity, not a secret (see ADR 0019,
 * docs/adr/0019-hls-encryption-keys-as-non-replicated-sidecars.md).
 */
export function maskKeyHex(seed: string, keyHex: string): string {
    const mask = createHash("sha256").update(seed).digest().subarray(0, 16);
    const key = Buffer.from(keyHex, "hex");
    return Buffer.from(key.map((byte, i) => byte ^ mask[i % mask.length])).toString("hex");
}