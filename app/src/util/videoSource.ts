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
