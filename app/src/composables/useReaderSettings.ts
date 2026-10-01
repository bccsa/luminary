import { computed, ref, watch, type CSSProperties } from "vue";
// Bundled rather than pulled from a font CDN so the reader fonts work offline; the browser
// only downloads a face once an article actually renders in it.
import "@fontsource-variable/literata";
import "@fontsource-variable/lexend";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/atkinson-hyperlegible/700-italic.css";

/** Article body size multipliers, smallest to largest. */
export const TEXT_SIZES = [0.875, 0.9375, 1, 1.125, 1.25] as const;
/** Article line heights, tightest to loosest; the middle one matches the prose default. */
export const LINE_HEIGHTS = [1.5, 1.75, 2] as const;

export const READER_FONTS = [
    { id: "inter", name: "Inter", family: "Inter, ui-sans-serif, system-ui, sans-serif" },
    { id: "georgia", name: "Georgia", family: "Georgia, 'Times New Roman', serif" },
    { id: "literata", name: "Literata", family: "'Literata Variable', Georgia, serif" },
    { id: "lexend", name: "Lexend", family: "'Lexend Variable', ui-sans-serif, sans-serif" },
    {
        id: "atkinson",
        name: "Atkinson Hyperlegible",
        family: "'Atkinson Hyperlegible', ui-sans-serif, sans-serif",
    },
] as const;

export type ReaderFontId = (typeof READER_FONTS)[number]["id"];

type ReaderSettings = { textSize: number; lineHeight: number; font: ReaderFontId };

const STORAGE_KEY = "readerSettings";
const DEFAULTS: ReaderSettings = { textSize: 2, lineHeight: 1, font: "inter" };

const clampIndex = (value: unknown, length: number, fallback: number) =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < length
        ? (value as number)
        : fallback;

function load(): ReaderSettings {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        return {
            textSize: clampIndex(stored.textSize, TEXT_SIZES.length, DEFAULTS.textSize),
            lineHeight: clampIndex(stored.lineHeight, LINE_HEIGHTS.length, DEFAULTS.lineHeight),
            font: READER_FONTS.some((f) => f.id === stored.font) ? stored.font : DEFAULTS.font,
        };
    } catch {
        return { ...DEFAULTS };
    }
}

// Module-level so the theme modal and the highlight popup edit the same settings.
const settings = ref<ReaderSettings>(load());

watch(
    settings,
    (value) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        } catch {
            /* storage full or unavailable — the setting just won't survive a reload */
        }
    },
    { deep: true },
);

/** The reader's article typography preferences (text size, line height, font), persisted per device. */
export function useReaderSettings() {
    const textSize = computed({
        get: () => settings.value.textSize,
        set: (v: number) =>
            (settings.value.textSize = Math.min(Math.max(v, 0), TEXT_SIZES.length - 1)),
    });
    const lineHeight = computed({
        get: () => settings.value.lineHeight,
        set: (v: number) => (settings.value.lineHeight = v),
    });
    const font = computed({
        get: () => settings.value.font,
        set: (v: ReaderFontId) => (settings.value.font = v),
    });

    /** CSS variables consumed by the `.reader-text` article styles. */
    const articleStyle = computed<CSSProperties>(() => ({
        "--reader-scale": String(TEXT_SIZES[settings.value.textSize]),
        "--reader-line-height": String(LINE_HEIGHTS[settings.value.lineHeight]),
        "--reader-font": READER_FONTS.find((f) => f.id === settings.value.font)!.family,
    }));

    return { textSize, lineHeight, font, articleStyle };
}
