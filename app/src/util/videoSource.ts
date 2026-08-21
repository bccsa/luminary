import type { ContentDto } from "luminary-shared";

/**
 * The video a content document should play.
 *
 * Two fields can name one, and they do not carry equal weight. `parentMedia.hlsUrl`
 * is the collection the encoder produced for this document — adaptive, multi-audio,
 * and the thing the CMS treats as the video from the moment it exists. `video` is a
 * URL somebody typed, which on a post that has since been encoded is a leftover.
 *
 * So the encoded collection wins wherever both are present. Reading them the other
 * way round leaves a post playing a stale link that the CMS no longer even offers to
 * edit.
 */
export function videoSourceFor(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
): string | undefined {
    return content?.parentMedia?.hlsUrl || content?.video || undefined;
}

/** Whether this content has a video to play at all. */
export function hasVideoSource(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
): boolean {
    return Boolean(videoSourceFor(content));
}

/**
 * The URL a player should actually fetch.
 *
 * `parentMedia.hlsUrl` is stored relative to the document's own media bucket —
 * `/prefix/master.m3u8` — so that the bucket's address lives in one place and
 * cannot drift from the collection's path. Joining the two is the same thing
 * `LImage` does for images, and for the same reason.
 *
 * External sources — a YouTube link, an HLS master on someone else's CDN — are
 * stored absolute and come back untouched, so a caller never has to ask which
 * kind it is holding. Returns undefined while the bucket is still loading, which
 * is the honest answer: the URL is not knowable yet.
 */
export function resolveVideoSource(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
    bucketBaseUrl: string | undefined,
): string | undefined {
    const source = videoSourceFor(content);
    if (!source || !source.startsWith("/")) return source;
    if (!bucketBaseUrl) return undefined;
    return `${bucketBaseUrl.replace(/\/+$/, "")}${source}`;
}
