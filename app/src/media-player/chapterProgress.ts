import type { Chapter } from "@luminary-media-converter/player-web-legacy";

/** How much of a chapter has played at `time`: nothing before it, all of it after, the share between. */
export function chapterProgress(chapter: Chapter, time: number): number {
    const length = chapter.endTime - chapter.startTime;
    if (!(length > 0)) return time >= chapter.startTime ? 1 : 0;
    return Math.min(1, Math.max(0, (time - chapter.startTime) / length));
}
