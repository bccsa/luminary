/**
 * Resolving a stored media URL for playback in the CMS.
 *
 * `hlsUrl` is stored relative to the bucket the document names, so that the two
 * cannot drift when a bucket is renamed or re-pointed. A player needs the
 * absolute form, and the bucket's `publicUrl` is what turns one into the other.
 *
 * The rule is the API's — `api/src/changeRequests/documentProcessing/mediaUrl.ts`
 * decides the stored shape on save, and this is its inverse. The app resolves
 * the same way in `util/videoSource.ts`. Three readers of one convention; if it
 * ever grows a case, it belongs in `luminary-shared` rather than in a fourth
 * copy.
 */

/** Whether a stored URL is a path inside the document's own bucket. */
export function isBucketRelative(url: string | undefined): boolean {
    return typeof url === "string" && url.startsWith("/");
}

/**
 * The absolute URL a player should fetch, given what is stored.
 *
 * An already-absolute URL is returned untouched — media hosted elsewhere has no
 * bucket to be relative to — so a caller can apply this to every media URL
 * without first asking which kind it holds. A relative URL with no bucket to
 * resolve against is `undefined` rather than a broken path: there is no address
 * to fetch, and half of one is worse than none.
 */
export function toAbsoluteMediaUrl(
    stored: string | undefined,
    publicUrl: string | undefined,
): string | undefined {
    if (!stored || !isBucketRelative(stored)) return stored;
    if (!publicUrl) return undefined;
    return `${publicUrl.replace(/\/+$/, "")}${stored}`;
}
