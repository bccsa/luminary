export {
    activeLyric,
    cuesToLyrics,
    lyricText,
    type LyricCue,
} from "@luminary-media-converter/player-web";

/** How many lines of text out of view the lit line must be before the way back to it is offered. */
export const LYRIC_ARROW_LINES = 3;

/** Where a line of the lyrics sits, and the stretch of the list in view, in px down the list. */
export interface LyricView {
    rowTop: number;
    rowBottom: number;
    viewTop: number;
    viewHeight: number;
    /** The height of one line of text, the unit "out of view" is counted in. */
    lineHeight: number;
}

/**
 * Which way the lit line lies from what the viewer has scrolled to: "up" or "down" once it is
 * {@link LYRIC_ARROW_LINES} lines of text or more out of view, else null.
 */
export function lyricArrow(view: LyricView): "up" | "down" | null {
    const slack = view.lineHeight * LYRIC_ARROW_LINES;
    if (view.rowBottom < view.viewTop - slack) return "up";
    if (view.rowTop > view.viewTop + view.viewHeight + slack) return "down";
    return null;
}
