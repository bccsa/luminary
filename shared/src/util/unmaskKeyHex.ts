/**
 * Reverses the API's XOR mask (`SHA-256(seed)[0..15]`) on a sidecar-delivered hex
 * key. Self-inverse, so the same operation masks and unmasks. `seed` is the
 * sidecar's `sidecarId` from the `/sidecar` response.
 *
 * Deliberate duplication of `api/src/util/maskKey.ts` `maskKeyHex` — a browser
 * client cannot import server code. Keep the two algorithms identical.
 */
export async function unmaskKeyHex(seed: string, maskedKeyHex: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
    const mask = new Uint8Array(digest).subarray(0, 16);

    const masked = new Uint8Array(maskedKeyHex.length >> 1);
    for (let i = 0; i < masked.length; i++) {
        masked[i] = parseInt(maskedKeyHex.substring(i * 2, i * 2 + 2), 16);
    }

    return Array.from(masked, (byte, i) =>
        (byte ^ mask[i % mask.length]).toString(16).padStart(2, "0"),
    ).join("");
}
