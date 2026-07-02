import { stripHtml, type ContentDto } from "luminary-shared";

/**
 * Search-result snippet + term highlighting for the content cards.
 *
 * Duplicated from the app's SearchModal engine (`app/src/components/navigation/SearchModal.vue`)
 * — keep the two in sync. Emits HTML with `<mark>` around matched terms; everything else is
 * HTML-escaped, so the output is safe to render with `v-html`. Cards style the `<mark>`
 * element via scoped `:deep(mark)`.
 */

function extractPlainTextFromObject(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (!obj || typeof obj !== "object") return "";
    const node = obj as Record<string, unknown>;
    if (node.text && typeof node.text === "string") return node.text;
    if (Array.isArray(node.content)) {
        const texts = node.content.map((item) => extractPlainTextFromObject(item));
        let result = texts.filter((t) => t).join(" ");
        if (node.type === "paragraph" || node.type === "heading") result += "\n";
        return result;
    }
    return "";
}

/** Plain text from a rich-text JSON string, an HTML string, or a node object. */
function extractPlainText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") {
        try {
            return extractPlainTextFromObject(JSON.parse(content));
        } catch {
            return stripHtml(content);
        }
    }
    return extractPlainTextFromObject(content);
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Escape `text` and wrap query-term / phrase occurrences in `<mark>`. */
export function applyTermHighlights(text: string, query: string): string {
    if (!query?.trim()) return escapeHtml(text);
    const queryTermsAll = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    if (!queryTermsAll.length) return escapeHtml(text);

    // Trigram search ignores words shorter than 3 letters. For consistency, only highlight
    // <3-letter words when we can highlight the full phrase (handled below).
    const queryTerms = queryTermsAll.filter((t) => t.length >= 3);

    const textLower = text.toLowerCase();
    const normalizedPhrase = queryTermsAll.join(" ");

    const phrasePos = textLower.indexOf(normalizedPhrase);
    if (phrasePos !== -1) {
        const before = text.substring(0, phrasePos);
        const phrase = text.substring(phrasePos, phrasePos + normalizedPhrase.length);
        const after = text.substring(phrasePos + normalizedPhrase.length);
        return (
            escapeHtml(before) +
            `<mark>` +
            escapeHtml(phrase) +
            "</mark>" +
            applyTermHighlights(after, query)
        );
    }

    // Use Unicode-aware boundaries so accented characters like é, è, ç are handled correctly.
    if (!queryTerms.length) return escapeHtml(text);
    const termsInText = queryTerms.filter((t) => textLower.includes(t));
    if (!termsInText.length) return escapeHtml(text);

    const pattern = termsInText.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "giu");
    let built = "";
    let lastIndex = 0;
    for (const m of text.matchAll(regex)) {
        built +=
            escapeHtml(text.slice(lastIndex, m.index)) +
            `<mark>` +
            escapeHtml(m[0]) +
            "</mark>";
        lastIndex = (m.index ?? 0) + m[0].length;
    }
    built += escapeHtml(text.slice(lastIndex));
    return built;
}

function countTermMatches(text: string, queryTerms: string[]): number {
    const lower = text.toLowerCase();
    return queryTerms.filter((t) => lower.includes(t)).length;
}

function findBestPosition(text: string, queryTerms: string[]): number {
    const lower = text.toLowerCase();
    const phrasePos = lower.indexOf(queryTerms.join(" "));
    if (phrasePos !== -1) return phrasePos;
    let best = -1;
    for (const term of queryTerms) {
        const pos = lower.indexOf(term);
        if (pos !== -1 && (best === -1 || pos < best)) best = pos;
    }
    return best;
}

/** Best matching excerpt from summary/text, with terms highlighted. Undefined if no field text. */
function createHighlight(doc: Partial<ContentDto>, query: string): string | undefined {
    if (!query?.trim()) return undefined;

    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    if (!queryTerms.length) return undefined;

    // Wider window for longer queries so the full phrase fits in the excerpt.
    const maxLength = Math.min(300, 150 + queryTerms.length * 15);

    const candidates: { text: string; matches: number }[] = [
        { text: extractPlainText(doc.summary), matches: 0 },
        { text: extractPlainText(doc.text), matches: 0 },
    ].map((c) => ({ ...c, matches: countTermMatches(c.text, queryTerms) }));

    const best =
        candidates.find(
            (c) => c.matches === Math.max(...candidates.map((x) => x.matches)) && c.matches > 0,
        ) ?? candidates.find((c) => c.text.length > 0);

    if (!best?.text) return undefined;

    const pos = findBestPosition(best.text, queryTerms);
    const start = Math.max(0, (pos === -1 ? 0 : pos) - Math.floor(maxLength / 3));
    const excerpt = best.text.substring(start, start + maxLength);

    return applyTermHighlights(excerpt, query);
}

export type SearchHighlight = {
    /** Title with query terms highlighted (always present — falls back to escaped title). */
    titleHtml: string;
    /** Best content snippet with terms highlighted, when one matches. */
    snippetHtml?: string;
    /** Author with terms highlighted, when the doc has an author. */
    authorHtml?: string;
};

/** Build the highlighted title / snippet / author for a search-result card. */
export function buildSearchHighlight(doc: Partial<ContentDto>, query: string): SearchHighlight {
    return {
        titleHtml: applyTermHighlights(stripHtml(doc.title ?? ""), query),
        snippetHtml: createHighlight(doc, query),
        authorHtml: doc.author ? applyTermHighlights(stripHtml(doc.author), query) : undefined,
    };
}
