import { type ContentDto, toAbsoluteMediaUrl } from "luminary-shared";

/**
 * The video a content document should play. The encoded collection on the parent
 * wins over the legacy per-language `video` URL, which the CMS no longer edits.
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
 * The URL a player should actually fetch: the stored source resolved against the
 * document's media bucket. Undefined while the bucket is still loading.
 */
export function resolveVideoSource(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
    bucketBaseUrl: string | undefined,
): string | undefined {
    return toAbsoluteMediaUrl(videoSourceFor(content), bucketBaseUrl);
}
