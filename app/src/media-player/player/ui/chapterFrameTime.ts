import type { Chapter } from "@luminary-media-converter/player-web";

/**
 * The moment a chapter's picture is taken from: the middle of the chapter, which runs until the next one starts,
 * or for the last one until the end of the video (its own end while the duration is not known yet). The same rule
 * is in the native players' `NowPlayingRules.chapterFrameTime`.
 */
export function chapterFrameTime(
    chapters: readonly Chapter[],
    index: number,
    duration?: number,
): number {
    const chapter = chapters[index]!;
    const next = chapters[index + 1];
    const end = next
        ? next.startTime
        : duration !== undefined && Number.isFinite(duration) && duration > 0
          ? duration
          : chapter.endTime;
    return end > chapter.startTime ? (chapter.startTime + end) / 2 : chapter.startTime;
}
