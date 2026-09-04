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

/**
 * Whether this URL names a collection in one of our own buckets.
 *
 * A bucket-relative URL is ours by construction — it is nothing without a
 * bucket to measure it against. An absolute one has to be asked: it is ours if
 * it sits under some configured bucket's public URL, and external otherwise.
 *
 * The distinction is what decides whether `mediaBucketId` is required. It is
 * not bookkeeping: the bucket is how a URL is stored relative, how a bucket
 * change migrates the files, and how deleting the document finds them. A
 * YouTube link and an HLS master on someone else's CDN have none of that, and
 * demanding a bucket for them records a bucket that does not own anything.
 *
 * The separator is part of the match, for the same reason it is in
 * {@link toStoredMediaUrl}: a bucket published at `https://cdn/media` must not
 * claim `https://cdn/media-archive/...`.
 */
export function isInOurStorage(
    hlsUrl: string | undefined,
    publicUrls: (string | undefined)[],
): boolean {
    if (!hlsUrl) return false;
    if (isBucketRelative(hlsUrl)) return true;

    return publicUrls.some((publicUrl) => {
        if (!publicUrl) return false;
        const base = publicUrl.replace(/\/+$/, "");
        return hlsUrl.startsWith(`${base}/`);
    });
}
