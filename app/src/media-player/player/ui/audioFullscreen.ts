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

/** A cell of the tools row is never wider than this, however few tools there are. */
export const TOOL_CELL_MAX_PX = 64;

/** Under this cell width the tool's glyph shrinks with the cell. */
export const TOOL_GLYPH_FULL_CELL_PX = 52;

/**
 * One label size for the whole tools row, in px: 11 while the widest label (`widestAt11`, measured at 11px) fits the
 * `cell` less `pad`, smaller so it does, never under 9; what is still too long is cut with an ellipsis.
 */
export function toolLabelPx(widestAt11: number, cell: number, pad: number): number {
    if (widestAt11 <= 0) return 11;
    return Math.min(11, Math.max(9, (11 * (cell - pad)) / widestAt11));
}

/** The tool glyph's side in a `cell` px wide: 24, scaled down with a cell narrower than a full one. */
export function toolGlyphPx(cell: number): number {
    return 24 * Math.min(1, Math.max(0, cell) / TOOL_GLYPH_FULL_CELL_PX);
}

/** On the quality button:the held quality, else (on Auto) the height playing; none before either is known. */
export function qualityBadge(
    held: number | undefined,
    playing: number | undefined,
): string | undefined {
    const height = held ?? playing;
    return height ? `${height}p` : undefined;
}

/** On the quality button with sound alone: the bitrate held, in kilobits ("64k"); none when unknown. */
export function bitrateBadge(bandwidth: number | undefined): string | undefined {
    return bandwidth && bandwidth > 0 ? `${Math.round(bandwidth / 1000)}k` : undefined;
}

/**
 * The Auto row with sound alone says what Auto plays, as the picture's does: "Auto (128 kbps)", in the words of the
 * menu's own row for that bitrate; plain "Auto" while nothing is known.
 */
export function autoBitrateLabel(
    auto: string,
    playing: number | undefined,
    qualities: readonly { label: string; bandwidth?: number }[],
): string {
    if (!playing || playing <= 0) return auto;
    const row = qualities.find((quality) => quality.bandwidth === playing);
    return `${auto} (${row?.label ?? `${Math.round(playing / 1000)} kbps`})`;
}

/** The Auto row says what Auto plays: "Auto (480p)", or plain "Auto" while nothing is drawn. */
export function autoQualityLabel(auto: string, playing: number | undefined): string {
    return playing ? `${auto} (${playing}p)` : auto;
}

/** Tags that name no language: several, undetermined, none, or not coded (the untranslated original). */
const NO_LANGUAGE = new Set(["mul", "und", "zxx", "mis"]);

/**
 * A track's language as a badge: its primary subtag in capitals, the two-letter code where the language has one
 * ("EN" for eng, "PT" for pt-BR); none for a tag that names no language.
 */
export function languageBadge(lang: string | undefined | null): string | undefined {
    const tag = lang?.trim().replace(/_/g, "-");
    if (!tag) return undefined;
    let primary = tag.split("-")[0]!.toLowerCase();
    try {
        // Canonical tags use the two-letter code where there is one, so streams tagged `eng` or `fre` read as the rest.
        primary = new Intl.Locale(primary).language;
    } catch {
        // Not a well-formed tag: shown as it is.
    }
    if (NO_LANGUAGE.has(primary)) return undefined;
    return primary.toUpperCase();
}
