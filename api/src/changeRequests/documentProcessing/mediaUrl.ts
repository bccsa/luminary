/**
 * The shape a media URL is stored in.
 *
 * A collection this API can reach lives in a bucket the document already names
 * through `mediaBucketId`, so repeating the bucket's public URL in `hlsUrl`
 * stores the same fact twice — and the two then drift the moment a bucket is
 * renamed, re-pointed at a new CDN, or the collection is moved. Stored relative,
 * the URL says where inside the bucket the collection is and nothing more, and
 * the bucket says where that is on the internet.
 *
 * Anything not under the bucket is left exactly as given: a YouTube link or an
 * HLS master on someone else's CDN has no bucket to be relative to.
 */

/** Whether a stored URL is a path inside the document's own bucket. */
export function isBucketRelative(url: string | undefined): boolean {
    return typeof url === "string" && url.startsWith("/");
}

/**
 * The form to store, given what the user or the encoder supplied.
 *
 * Returns the input unchanged when there is no bucket to measure against or the
 * URL is not inside it, so calling this on an external URL is safe and calling
 * it twice does nothing the second time.
 */
export function toStoredMediaUrl(
    hlsUrl: string | undefined,
    publicUrl: string | undefined,
): string | undefined {
    if (!hlsUrl || isBucketRelative(hlsUrl) || !publicUrl) return hlsUrl;

    const base = publicUrl.replace(/\/+$/, "");
    // The separator is part of the match, or a bucket published at
    // `https://cdn/media` would claim `https://cdn/media-archive/...`.
    if (!hlsUrl.startsWith(`${base}/`)) return hlsUrl;

    return hlsUrl.slice(base.length);
}

/**
 * The absolute URL a player should fetch, given what is stored.
 *
 * The inverse of {@link toStoredMediaUrl}, and the same courtesy in reverse: an
 * already-absolute URL is returned untouched, so a consumer can call this on
 * every media URL without asking which kind it holds.
 */
export function toAbsoluteMediaUrl(
    stored: string | undefined,
    publicUrl: string | undefined,
): string | undefined {
    if (!stored || !isBucketRelative(stored)) return stored;
    if (!publicUrl) return undefined;
    return `${publicUrl.replace(/\/+$/, "")}${stored}`;
}
