// ---------------------------------------------------------------------------
// Shared reading-speed helpers (UI estimates + progress-tracker gates)
// ---------------------------------------------------------------------------

/** Default words-per-minute when a language has no averageReadingSpeed. */
export const DEFAULT_READING_SPEED_WPM = 200;

// --- Gate 3: per-block dwell time ------------------------------------------------

/** Shortest block dwell — quick glance on a tiny block should not count. */
export const READING_MIN_DWELL_MS = 500;

/** Longest block dwell — caps wait time for very long blocks. */
export const READING_MAX_DWELL_MS = 8000;

// --- Gate 2: skim detection (scroll speed in words per second) -------------------

/**
 * Skim threshold multiplier.
 *
 * maxWordsPerSec = (languageWPM / 60) × READING_SKIM_WPM_MULTIPLIER
 *
 * Example at 200 WPM: reading ≈ 3.3 w/s, skim cap ≈ 10 w/s.
 */
export const READING_SKIM_WPM_MULTIPLIER = 3;

/** Batch scroll events shorter than this before measuring words/s (trackpad jitter). */
export const READING_MIN_SCROLL_SAMPLE_MS = 50;

// --- Gate 4: idle pause ----------------------------------------------------------

/** Pause dwell when the user has not scrolled or changed visibility for this long. */
export const READING_IDLE_MS = 45_000;

// --- Language WPM ----------------------------------------------------------------

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

// --- UI: estimated reading time badge --------------------------------------------

/** Article-level estimate shown in the UI (minutes). Not used by the progress tracker. */
export function computeEstimatedReadingMinutes(
    wordCount: number,
    wordsPerMinute?: number | null,
): number {
    if (!wordCount) return 0;
    return Math.ceil(wordCount / resolveReadingSpeedWpm(wordsPerMinute));
}

// --- Progress tracker: dwell per block -------------------------------------------

/**
 * Milliseconds the active block must remain eligible before it is confirmed.
 * Scales with word count and language WPM; clamped to min/max bounds.
 */
export function computeBlockDwellMs(
    wordCount: number,
    wordsPerMinute?: number | null,
): number {
    if (wordCount <= 0) return READING_MIN_DWELL_MS;
    const wpm = resolveReadingSpeedWpm(wordsPerMinute);
    const ms = Math.round((wordCount / wpm) * 60_000);
    return Math.min(READING_MAX_DWELL_MS, Math.max(READING_MIN_DWELL_MS, ms));
}

// --- Progress tracker: skim detection --------------------------------------------

/** Words per pixel of block height (from rendered DOM). Zero when inputs are invalid. */
export function estimateWordsPerPixel(wordCount: number, blockHeightPx: number): number {
    if (wordCount <= 0 || blockHeightPx <= 0) return 0;
    return wordCount / blockHeightPx;
}

/** Upper bound on scroll speed (words/s) before the user is treated as skimming. */
export function computeMaxScrollWordsPerSec(wordsPerMinute?: number | null): number {
    const wpm = resolveReadingSpeedWpm(wordsPerMinute);
    return (wpm / 60) * READING_SKIM_WPM_MULTIPLIER;
}

/**
 * Scroll speed in words per second from a batched scroll sample.
 * Returns 0 when the sample window is too short or word density is unknown.
 */
export function computeScrollVelocityWordsPerSec(
    deltaY: number,
    deltaMs: number,
    wordsPerPixel: number,
): number {
    if (deltaMs < READING_MIN_SCROLL_SAMPLE_MS || wordsPerPixel <= 0) return 0;
    const wordsScrolled = Math.abs(deltaY) * wordsPerPixel;
    return wordsScrolled / (deltaMs / 1000);
}
