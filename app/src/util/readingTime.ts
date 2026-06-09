/** Default words-per-minute when a language has no averageReadingSpeed. */
export const DEFAULT_READING_SPEED_WPM = 200;

/** Shortest block dwell — quick glance on a tiny block should not count. */
export const READING_MIN_DWELL_MS = 500;

/** Longest block dwell — caps wait time for very long blocks. */
export const READING_MAX_DWELL_MS = 8000;

/** Base skim threshold (px/s) at {@link DEFAULT_READING_SPEED_WPM}. */
export const READING_BASE_MAX_SCROLL_VELOCITY_PX_S = 1200;

/** Pause dwell when the user has not scrolled or changed visibility for this long. */
export const READING_IDLE_MS = 45_000;

/** Ignore velocity samples shorter than this (trackpad / layout jitter). */
export const READING_MIN_SCROLL_SAMPLE_MS = 50;

export function resolveReadingSpeedWpm(wordsPerMinute?: number | null): number {
    if (wordsPerMinute == null || wordsPerMinute <= 0 || Number.isNaN(wordsPerMinute)) {
        return DEFAULT_READING_SPEED_WPM;
    }
    return wordsPerMinute;
}

export function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

/** Article-level estimate shown in the UI (minutes). */
export function computeEstimatedReadingMinutes(
    wordCount: number,
    wordsPerMinute?: number | null,
): number {
    if (!wordCount) return 0;
    return Math.ceil(wordCount / resolveReadingSpeedWpm(wordsPerMinute));
}

/** Per-block dwell for progress tracking (milliseconds). */
export function computeBlockDwellMs(
    wordCount: number,
    wordsPerMinute?: number | null,
): number {
    if (wordCount <= 0) return READING_MIN_DWELL_MS;
    const wpm = resolveReadingSpeedWpm(wordsPerMinute);
    const ms = Math.round((wordCount / wpm) * 60_000);
    return Math.min(READING_MAX_DWELL_MS, Math.max(READING_MIN_DWELL_MS, ms));
}

/** Scale skim scroll cap with language reading speed (200 WPM → 1200 px/s). */
export function computeMaxScrollVelocityPxS(wordsPerMinute?: number | null): number {
    const wpm = resolveReadingSpeedWpm(wordsPerMinute);
    return Math.round(READING_BASE_MAX_SCROLL_VELOCITY_PX_S * (wpm / DEFAULT_READING_SPEED_WPM));
}
