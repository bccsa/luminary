/** Default words-per-minute when a language has no averageReadingSpeed. */
export const DEFAULT_READING_SPEED_WPM = 200;

/** Shortest block dwell — quick glance on a tiny block should not count. */
export const READING_MIN_DWELL_MS = 500;

/** Longest block dwell — caps wait time for very long blocks. */
export const READING_MAX_DWELL_MS = 8000;

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
