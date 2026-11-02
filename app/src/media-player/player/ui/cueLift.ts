/** What of a `VTTCue` the lift reads and writes; a plain object stands in for one in tests. */
export interface LiftableCue {
    line: number | "auto";
    snapToLines: boolean;
}

type Placement = Pick<LiftableCue, "line" | "snapToLines">;

/**
 * The share of the picture's height one line of subtitles takes, at least. Browsers draw subtitles in a font of
 * 5% of the picture's height (Chrome's lines come out near 5.8%), so counting lines with this one never falls
 * short of the bar: at worst the subtitle sits a little higher than it needs to.
 */
const MIN_LINE_SHARE = 0.05;

/**
 * The line, counted up from the bottom of the picture as WebVTT's negative lines are, that keeps a cue clear of a
 * bar `barHeight` tall over the foot of a picture `frameHeight` tall; null when nothing needs clearing. Line -1
 * rests on the bottom edge, and each line further up lifts the cue by one line's height.
 */
export function liftLine(barHeight: number, frameHeight: number): number | null {
    if (!(frameHeight > 0) || !(barHeight > 0)) return null;
    const lineHeight = frameHeight * MIN_LINE_SHARE;
    return -(1 + Math.ceil(Math.min(barHeight, frameHeight) / lineHeight));
}

/**
 * Moves cues to `line`, or puts them back when `line` is null. The browser draws subtitles at the foot of the picture
 * and knows nothing of the player's controls, which would hide them. Counted lines are what every browser places
 * alike (Chrome ignores a cue's line alignment, which a percentage line depends on). Only cues left to the browser's
 * own placement move: one its author placed (at the top, say) stays.
 */
export function liftCues(
    cues: Iterable<LiftableCue>,
    line: number | null,
    saved: WeakMap<LiftableCue, Placement>,
): void {
    for (const cue of cues) {
        const original = saved.get(cue);
        if (line === null) {
            if (!original) continue;
            cue.line = original.line;
            cue.snapToLines = original.snapToLines;
            saved.delete(cue);
            continue;
        }
        if (!original) {
            if (cue.line !== "auto") continue;
            saved.set(cue, { line: cue.line, snapToLines: cue.snapToLines });
        }
        cue.snapToLines = true;
        cue.line = line;
    }
}
