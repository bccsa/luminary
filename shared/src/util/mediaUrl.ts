/**
 * Resolving a stored media URL for playback.
 *
 * `hlsUrl` is stored relative to the bucket the document names so the two cannot
 * drift when a bucket is renamed or re-pointed; a player needs the absolute form.
 * The stored shape is decided by the API on save (`documentProcessing/mediaUrl.ts`);
 * this is its inverse, shared by the app and the CMS.
 */

/** Whether a stored URL is a path inside the document's own bucket. */
export function isBucketRelative(url: string | undefined): boolean {
    return typeof url === "string" && url.startsWith("/");
}

/**
 * Trailing slashes off, by index rather than with `/\/+$/`.
 *
 * The regex backtracks quadratically over a long run of slashes, and in a library
 * the argument is whatever a caller passes (CodeQL js/polynomial-redos).
 */
function withoutTrailingSlashes(url: string): string {
    let end = url.length;
    while (end > 0 && url.charCodeAt(end - 1) === 47) end--;
    return url.slice(0, end);
}

/**
 * The absolute URL a player should fetch. Absolute (external) URLs pass through
 * untouched; a relative URL with no bucket to resolve against is `undefined`
 * rather than a broken path.
 */
export function toAbsoluteMediaUrl(
    stored: string | undefined,
    publicUrl: string | undefined,
): string | undefined {
    if (!stored || !isBucketRelative(stored)) return stored;
    if (!publicUrl) return undefined;
    return `${withoutTrailingSlashes(publicUrl)}${stored}`;
}
