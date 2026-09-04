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
    return `${publicUrl.replace(/\/+$/, "")}${stored}`;
}
