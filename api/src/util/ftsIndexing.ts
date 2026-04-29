/**
 * Server-side Full-Text Search (FTS) indexing.
 *
 * Computes trigram-based FTS data for Content documents so that clients receive
 * pre-calculated indexes and don't need to do CPU-intensive trigram computation.
 *
 * ## Hard-coded field configuration
 *
 * The FTS field config below is intentionally hard-coded rather than configurable.
 * See ADR 0009 (docs/adr/0009-server-side-fts-indexing.md) for the rationale.
 *
 * Key reasons:
 * - Fields are tightly coupled to the ContentDto schema and only change when the schema changes
 * - A shared config adds complexity for a value that rarely changes
 * - Any change requires a full re-index migration regardless of how the config is stored
 *
 * **IMPORTANT**: This config must be kept in sync with the search-side config in
 * `shared/src/fts/ftsSearch.ts`. If you change boost values or fields here,
 * update the other location as well.
 *
 * Boost values control how much matches in each field affect ranking:
 * - title (3.0): Title matches are weighted 3x — most important for relevance
 * - summary (1.5): Summary matches are weighted 1.5x
 * - text (1.0): Body text at baseline weight (HTML is stripped before indexing)
 * - author (1.0): Author name at baseline weight
 */

type FtsFieldConfig = {
    name: string;
    boost: number;
    isHtml: boolean;
};

// Reading time calculation constant
const WORDS_PER_MINUTE = 200;

const FTS_FIELDS: FtsFieldConfig[] = [
    { name: "title", boost: 3.0, isHtml: false },
    { name: "summary", boost: 1.5, isHtml: false },
    { name: "text", boost: 1.0, isHtml: true },
    { name: "author", boost: 1.0, isHtml: false },
];

export type FtsData = {
    fts: string[];
    ftsTokenCount: number;
};

// ── HTML stripping ──────────────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

/**
 * Strip HTML tags from a string using a linear scan state-machine parser.
 * Handles script/style blocks, HTML comments, and common HTML entities.
 * O(n) single-pass, no regex backtracking.
 */
export function stripHtml(html: string): string {
    if (!html) return "";

    const len = html.length;
    const result: string[] = [];
    let i = 0;
    let inTag = false;
    let inScript = false;
    let inStyle = false;
    let inComment = false;

    while (i < len) {
        if (inComment) {
            if (html[i] === "-" && html[i + 1] === "-" && html[i + 2] === ">") {
                inComment = false;
                i += 3;
            } else {
                i++;
            }
        } else if (inScript) {
            if (
                html[i] === "<" &&
                html[i + 1] === "/" &&
                html.substring(i + 2, i + 8).toLowerCase() === "script" &&
                html[i + 8] === ">"
            ) {
                inScript = false;
                i += 9;
            } else {
                i++;
            }
        } else if (inStyle) {
            if (
                html[i] === "<" &&
                html[i + 1] === "/" &&
                html.substring(i + 2, i + 7).toLowerCase() === "style" &&
                html[i + 7] === ">"
            ) {
                inStyle = false;
                i += 8;
            } else {
                i++;
            }
        } else if (inTag) {
            if (html[i] === ">") {
                inTag = false;
                result.push(" ");
            }
            i++;
        } else if (html[i] === "<") {
            if (html[i + 1] === "!" && html[i + 2] === "-" && html[i + 3] === "-") {
                inComment = true;
                i += 4;
            } else if (html.substring(i + 1, i + 7).toLowerCase() === "script") {
                inScript = true;
                i += 7;
            } else if (html.substring(i + 1, i + 6).toLowerCase() === "style") {
                inStyle = true;
                i += 6;
            } else {
                inTag = true;
                i++;
            }
        } else if (html[i] === "&") {
            const semicolonIdx = html.indexOf(";", i + 1);
            if (semicolonIdx !== -1 && semicolonIdx - i <= 8) {
                const entity = html.substring(i + 1, semicolonIdx);
                if (entity[0] === "#") {
                    const code =
                        entity[1] === "x"
                            ? parseInt(entity.substring(2), 16)
                            : parseInt(entity.substring(1), 10);
                    if (!isNaN(code)) {
                        result.push(String.fromCharCode(code));
                        i = semicolonIdx + 1;
                        continue;
                    }
                } else if (HTML_ENTITIES[entity]) {
                    result.push(HTML_ENTITIES[entity]);
                    i = semicolonIdx + 1;
                    continue;
                }
            }
            result.push(html[i]);
            i++;
        } else {
            result.push(html[i]);
            i++;
        }
    }

    return result.join("");
}

/**
 * Calculate the estimated reading time for a given text (in minutes).
 * Uses a standard reading speed of 200 words per minute.
 */
export function calculateReadingTime(text: string): number {
    const strippedText = stripHtml(text).trim();
    if (!strippedText) return 0;
    const wordCount = strippedText.split(/\s+/).length;
    return Math.ceil(wordCount / WORDS_PER_MINUTE);
}

// ── Text normalization ──────────────────────────────────────────────────────

/**
 * Normalize text for trigram generation.
 * Lowercases, strips diacritics, and collapses whitespace.
 */
export function normalizeText(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ── Trigram generation ──────────────────────────────────────────────────────

/**
 * Generate trigrams with frequency counts from text.
 * Returns a Map of trigram → occurrence count, plus totalCount for document length.
 * Caps at 5000 chars to limit index size.
 */
export function generateTrigramCounts(text: string): {
    counts: Map<string, number>;
    totalCount: number;
} {
    const counts = new Map<string, number>();
    let totalCount = 0;
    const normalized = normalizeText(text);
    if (!normalized) return { counts, totalCount };

    const capped = normalized.length > 5000 ? normalized.substring(0, 5000) : normalized;
    const words = capped.split(" ");

    for (const word of words) {
        if (word.length <= 2) continue;
        for (let i = 0; i <= word.length - 3; i++) {
            const trigram = word.substring(i, i + 3);
            counts.set(trigram, (counts.get(trigram) || 0) + 1);
            totalCount++;
        }
    }

    return { counts, totalCount };
}

// ── FTS computation ─────────────────────────────────────────────────────────

/**
 * Compute pre-calculated FTS data for a Content document.
 *
 * Iterates configured fields, generates trigrams, applies boost multipliers,
 * and aggregates into a flat token array suitable for delivery to clients.
 *
 * @returns FTS data with token array and raw token count, or undefined if no indexable content
 */
export function computeFtsData(doc: Record<string, any>): FtsData | undefined {
    const aggregatedTf = new Map<string, number>();
    let totalTokenCount = 0;

    for (const field of FTS_FIELDS) {
        const value = doc[field.name];
        if (typeof value !== "string" || !value) continue;

        const text = field.isHtml ? stripHtml(value) : value;
        const { counts, totalCount } = generateTrigramCounts(text);
        totalTokenCount += totalCount;

        counts.forEach((count, trigram) => {
            aggregatedTf.set(trigram, (aggregatedTf.get(trigram) || 0) + count * field.boost);
        });
    }

    if (aggregatedTf.size === 0) return undefined;

    const fts: string[] = Array.from(aggregatedTf.entries()).map(([token, tf]) => token + ":" + tf);

    return { fts, ftsTokenCount: totalTokenCount };
}
