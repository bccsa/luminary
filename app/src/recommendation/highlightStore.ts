import { ref } from "vue";
import { db, type Uuid } from "luminary-shared";
import { parseSavedRanges, type HighlightRange } from "@/util/highlightRanges";

const HIGHLIGHTS_STORAGE_KEY = "highlights";
/** Bound local FTS work when a long-lived install has many saved highlights. */
export const MAX_HIGHLIGHT_QUERIES = 4;
/** A very long selection is usually several ideas; keep each FTS query focused and bounded. */
export const MAX_HIGHLIGHT_QUERY_LENGTH = 160;

/**
 * A content document's persisted highlights. Older installs hold `{ html, updatedAt }` or the
 * raw HTML string — a snapshot of the whole article — which is still read.
 */
export type SavedHighlight = {
    ranges: HighlightRange[];
    updatedAt: number;
    /** The post this translation belongs to. Absent on entries written before it was stored. */
    parentId?: Uuid;
};

export type HighlightQuery = {
    query: string;
    updatedAt: number;
};

/**
 * IndexedDB has no Vue reactivity. SingleContent bumps this only after LHighlightable
 * successfully saves, so mounted recommendation feeds reload their local text signals.
 */
export const highlightVersion = ref(0);

export function notifyHighlightsChanged() {
    highlightVersion.value++;
}

/** The saved ranges, when the entry is in the current (range) shape. */
export function getHighlightRanges(value: unknown): HighlightRange[] | undefined {
    if (!value || typeof value !== "object" || !("ranges" in value)) return undefined;
    return parseSavedRanges((value as SavedHighlight).ranges);
}

/** The whole-article HTML snapshot, when the entry is in either legacy shape. */
export function getLegacyHighlightHtml(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "html" in value) {
        const html = (value as { html: unknown }).html;
        if (typeof html === "string") return html;
    }
    return undefined;
}

function getHighlightTexts(value: unknown): string[] {
    const ranges = getHighlightRanges(value);
    if (ranges) return ranges.map((r) => r.text);
    const html = getLegacyHighlightHtml(value);
    if (!html) return [];
    const template = document.createElement("template");
    template.innerHTML = html;
    return [...template.content.querySelectorAll("mark")].map((m) => m.textContent || "");
}

function getUpdatedAt(value: unknown): number {
    if (
        value &&
        typeof value === "object" &&
        "updatedAt" in value &&
        typeof (value as SavedHighlight).updatedAt === "number" &&
        Number.isFinite((value as SavedHighlight).updatedAt)
    ) {
        return (value as SavedHighlight).updatedAt;
    }
    // Existing highlights predate timestamps. They remain eligible, but newly changed
    // highlights win when the retrieval cap is reached.
    return 0;
}

function normalizeHighlightQuery(value: string): string | undefined {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < 3) return undefined;
    return normalized.slice(0, MAX_HIGHLIGHT_QUERY_LENGTH).trim();
}

/**
 * Extract a bounded, newest-first set of active highlight excerpts from persisted highlights.
 * Kept pure so storage compatibility and normalization can be tested without Dexie.
 */
export function extractHighlightQueries(data: unknown): HighlightQuery[] {
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];

    const entries = Object.values(data as Record<string, unknown>)
        .map((value) => ({ texts: getHighlightTexts(value), updatedAt: getUpdatedAt(value) }))
        .sort((a, b) => b.updatedAt - a.updatedAt);

    const seen = new Set<string>();
    const queries: HighlightQuery[] = [];
    for (const { texts, updatedAt } of entries) {
        for (const text of texts) {
            const query = normalizeHighlightQuery(text);
            if (!query) continue;
            const key = query.toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            queries.push({ query, updatedAt });
            if (queries.length >= MAX_HIGHLIGHT_QUERIES) return queries;
        }
    }
    return queries;
}

/** Best-effort local read: unavailable/corrupt highlight storage must not break tags. */
export async function loadHighlightQueries(): Promise<HighlightQuery[]> {
    try {
        return extractHighlightQueries(await db.getLuminaryInternals(HIGHLIGHTS_STORAGE_KEY));
    } catch {
        return [];
    }
}

/**
 * Same as {@link loadHighlightQueries}, scoped to a single content document's own saved
 * highlight(s) — used to seed "more like this" for the article the reader is currently on,
 * rather than every highlight saved across the whole app.
 */
export async function loadHighlightQueriesFor(contentId: string): Promise<HighlightQuery[]> {
    try {
        const all = await db.getLuminaryInternals(HIGHLIGHTS_STORAGE_KEY);
        if (!all || typeof all !== "object") return [];
        if (!(contentId in all)) return [];
        return extractHighlightQueries({ [contentId]: all[contentId] });
    } catch {
        return [];
    }
}
