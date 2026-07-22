import { ref } from "vue";
import { db } from "luminary-shared";

const HIGHLIGHTS_STORAGE_KEY = "highlights";
/** Bound local FTS work when a long-lived install has many saved highlights. */
export const MAX_HIGHLIGHT_QUERIES = 4;
/** A very long selection is usually several ideas; keep each FTS query focused and bounded. */
export const MAX_HIGHLIGHT_QUERY_LENGTH = 160;

/** New-format persisted highlight entry. Legacy entries are the raw HTML string itself. */
export type SavedHighlight = {
    html: string;
    updatedAt: number;
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

/** Read both the legacy HTML-string shape and the timestamped shape written going forward. */
export function getHighlightHtml(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (
        value &&
        typeof value === "object" &&
        "html" in value &&
        typeof (value as SavedHighlight).html === "string"
    ) {
        return (value as SavedHighlight).html;
    }
    return undefined;
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
 * Extract a bounded, newest-first set of active highlight excerpts from persisted HTML.
 * Kept pure so storage compatibility and normalization can be tested without Dexie.
 */
export function extractHighlightQueries(data: unknown): HighlightQuery[] {
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];

    const entries = Object.values(data as Record<string, unknown>)
        .map((value) => ({ html: getHighlightHtml(value), updatedAt: getUpdatedAt(value) }))
        .filter((entry): entry is { html: string; updatedAt: number } => !!entry.html)
        .sort((a, b) => b.updatedAt - a.updatedAt);

    const seen = new Set<string>();
    const queries: HighlightQuery[] = [];
    for (const { html, updatedAt } of entries) {
        const template = document.createElement("template");
        template.innerHTML = html;
        for (const mark of template.content.querySelectorAll("mark")) {
            const query = normalizeHighlightQuery(mark.textContent || "");
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
