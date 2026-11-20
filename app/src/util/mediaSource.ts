import { type ContentDto, type MangoSelector, toAbsoluteMediaUrl } from "luminary-shared";

/**
 * Content query clause matching what {@link hasVideoSource} accepts: newer content has only
 * the parent's encoded media, older only the per-language `video` URL.
 */
export const hasVideoSelector: MangoSelector = {
    $or: [
        { $and: [{ video: { $exists: true, $ne: "" } }, { video: { $ne: null } }] },
        { "parentMedia.hlsUrl": { $exists: true, $ne: "" } },
    ],
};

/**
 * The media, audio or video, a content document should play. The encoded collection on the parent
 * wins over the legacy per-language `video` URL, which the CMS no longer edits.
 */
export function mediaSourceFor(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
): string | undefined {
    return content?.parentMedia?.hlsUrl || content?.video || undefined;
}

/** Whether this content has media to play at all. */
export function hasMediaSource(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
): boolean {
    return Boolean(mediaSourceFor(content));
}

/**
 * The URL a player should actually fetch: the stored source resolved against the
 * document's media bucket. Undefined while the bucket is still loading.
 */
export function resolveMediaSource(
    content: Pick<ContentDto, "video" | "parentMedia"> | undefined | null,
    bucketBaseUrl: string | undefined,
): string | undefined {
    return toAbsoluteMediaUrl(mediaSourceFor(content), bucketBaseUrl);
}
