import type { ChapterSegment } from "@luminary-media-converter/player-web";

/** Half the gap between two chapters, in px at the player's normal scale; it follows `--lmpl-s` with everything else. */
const HALF_GAP_PX = 1.5;
/** The same for a bar with many chapters: a hairline, so the stretches still read and none is eaten by its gap. */
const HALF_HAIRLINE_PX = 0.5;
/** Past this many stretches the gap gives way to a hairline. */
export const DENSE_CHAPTERS = 16;
/** Past this many a cut every few pixels is noise, and the bar stays one plain bar. */
export const MAX_CUT_CHAPTERS = 60;

/**
 * A mask that cuts the timeline into its chapters: opaque everywhere except a thin band at each chapter start.
 * Applied to the track it opens a gap through the track, its buffer and its fill alike, so the bar reads as
 * separate stretches wherever it is drawn, over any picture, without a gap colour to match.
 *
 * With many chapters the gaps would eat the bar, so past {@link DENSE_CHAPTERS} they thin to a hairline, and
 * past {@link MAX_CUT_CHAPTERS} the bar is left whole.
 *
 * Empty when there is nothing to cut (fewer than two segments), or too much, so the bar stays one plain bar.
 */
export function chapterMask(segments: readonly ChapterSegment[]): string {
    if (segments.length < 2 || segments.length > MAX_CUT_CHAPTERS) return "";
    const half = `(var(--lmpl-s, 1) * ${segments.length > DENSE_CHAPTERS ? HALF_HAIRLINE_PX : HALF_GAP_PX}px)`;
    const stops = ["#000 0"];
    for (const segment of segments.slice(1)) {
        const at = `${(segment.start * 100).toFixed(3)}%`;
        stops.push(
            `#000 calc(${at} - ${half})`,
            `transparent calc(${at} - ${half})`,
            `transparent calc(${at} + ${half})`,
            `#000 calc(${at} + ${half})`,
        );
    }
    stops.push("#000 100%");
    return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Fills `{index}` and `{count}` in the "Chapter 4 of 7" message; a translator may move either. */
export function formatChapterOf(template: string, index: number, count: number): string {
    return template.replace("{index}", String(index)).replace("{count}", String(count));
}
