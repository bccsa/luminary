import type { Chapter, SleepTimerState } from "@luminary-media-converter/player-web";

/** The speeds the fullscreen audio screen offers: a listener of speech wants a few steps either side of normal. */
export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** The minutes the sleep timer offers, before "end of chapter". */
export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

/** How many chapters the landscape list shows at once: a window around the playing one. */
export const CHAPTER_WINDOW = 4;

/**
 * The chapters to list: a window of `size` around the playing one, one before it so the viewer sees what
 * they just heard, kept inside the list at both ends. Every chapter when there are no more than `size`.
 */
export function chapterWindow(
    chapters: readonly Chapter[],
    current: number,
    size: number = CHAPTER_WINDOW,
): { chapter: Chapter; index: number }[] {
    const all = chapters.map((chapter, index) => ({ chapter, index }));
    if (all.length <= size) return all;
    const start = Math.max(0, Math.min(current - 1, all.length - size));
    return all.slice(start, start + size);
}

/**
 * The minutes left on a minutes timer, rounded up: "3" until it has less than a minute, never "0" while it runs.
 * Null for no timer or a chapter timer.
 */
export function sleepMinutesLeft(state: SleepTimerState | null, now: number): number | null {
    if (state?.kind !== "minutes") return null;
    return Math.max(1, Math.ceil((state.endsAt - now) / 60_000));
}

/** Fills `{minutes}` in a message that carries a count of minutes. */
export function formatMinutes(template: string, minutes: number): string {
    return template.replace("{minutes}", String(minutes));
}

/** The held bar's moment, and where the frames go: `markerX` and `width` in px from the screen's left, `bottom` above its bottom. */
export interface ScrubPosition {
    time: number;
    markerX: number;
    width: number;
    bottom: number;
    /**
     * The player holds the strip open and closes it itself, holding and resuming playback as it does: a finger's tap
     * opened it. The host shows the frames while it is set, and leaves pausing, pinning and resuming to the player.
     */
    held?: boolean;
}
