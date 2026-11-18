import type { Chapter } from "@luminary-media-converter/player-web";

/** Past this far into a chapter, "previous" restarts it; within it, "previous" goes to the chapter before. */
export const CHAPTER_RESTART_SECONDS = 3;

/** A playhead this close before a chapter start counts as at it, so a seek that lands a hair short does not repeat. */
const LANDING_SLACK_SECONDS = 0.5;

/** The previous / next chapter buttons only show with a chapter boundary to skip to, as the "Chapter x of y" line. */
export function hasChapterSkip(chapters: readonly Chapter[]): boolean {
    return chapters.length >= 2;
}

function starts(chapters: readonly Chapter[]): number[] {
    return [...new Set(chapters.map((chapter) => Math.max(0, chapter.startTime)))].sort(
        (a, b) => a - b,
    );
}

/** Where "next chapter" goes from `time`: the next chapter's start, or null in the last chapter. */
export function nextChapterTime(chapters: readonly Chapter[], time: number): number | null {
    return starts(chapters).find((start) => start > time + LANDING_SLACK_SECONDS) ?? null;
}

/**
 * Where "previous chapter" goes from `time`: back to the start of the chapter playing when more than
 * {@link CHAPTER_RESTART_SECONDS} into it, else the chapter before, else the start of the video.
 */
export function previousChapterTime(chapters: readonly Chapter[], time: number): number {
    const list = starts(chapters);
    let index = -1;
    for (let i = 0; i < list.length; i++) if (list[i]! <= time + LANDING_SLACK_SECONDS) index = i;
    if (index < 0) return 0;
    const start = list[index]!;
    if (time - start > CHAPTER_RESTART_SECONDS) return start;
    return index > 0 ? list[index - 1]! : 0;
}

type GlyphLayer = { path: string; alpha: number; strokeWidth: number };

/**
 * Video.js 10 has no previous / next glyph, so these are its play triangle at 0.8 beside a bar, on its 18-unit grid.
 * Native full-screen draws the same paths.
 */
export const CHAPTER_GLYPHS: { previous: GlyphLayer[]; next: GlyphLayer[] } = {
    previous: [
        {
            path: "M6.559 10.378l6.388 3.971a1.584 1.584 0 0 0 2.206-.51A1.648 1.648 0 0 0 15.4 12.971V5.029C15.4 4.128 14.684 3.4 13.8 3.4c-.302 0-.598.087-.853.25l-6.388 3.971a1.646 1.646 0 0 0-.502 2.246c.128.206.298.38.502.51z",
            alpha: 1,
            strokeWidth: 0,
        },
        {
            path: "M3.85 3.4a1.25 1.25 0 0 1 1.25 1.25v8.7a1.25 1.25 0 0 1-2.5 0v-8.7a1.25 1.25 0 0 1 1.25-1.25z",
            alpha: 1,
            strokeWidth: 0,
        },
    ],
    next: [
        {
            path: "M11.441 10.378l-6.388 3.971a1.584 1.584 0 0 1-2.206-.51A1.648 1.648 0 0 1 2.6 12.971V5.029C2.6 4.128 3.316 3.4 4.2 3.4c.302 0 .598.087.853.25l6.388 3.971a1.646 1.646 0 0 1 .502 2.246c-.128.206-.298.38-.502.51z",
            alpha: 1,
            strokeWidth: 0,
        },
        {
            path: "M14.15 3.4a1.25 1.25 0 0 1 1.25 1.25v8.7a1.25 1.25 0 0 1-2.5 0v-8.7a1.25 1.25 0 0 1 1.25-1.25z",
            alpha: 1,
            strokeWidth: 0,
        },
    ],
};

/** The previous (or, when `forward`, next) chapter glyph as markup, for the controls written as strings. */
export function chapterIcon(forward: boolean): string {
    const layers = forward ? CHAPTER_GLYPHS.next : CHAPTER_GLYPHS.previous;
    return (
        '<svg class="lmpl-chapter-icon" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">' +
        layers.map((layer) => `<path d="${layer.path}"/>`).join("") +
        "</svg>"
    );
}
