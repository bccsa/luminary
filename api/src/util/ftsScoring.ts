/**
 * Server-side Full-Text Search (FTS) scoring.
 *
 * Reproduces the BM25 ranking and full-word match bonus used by the offline
 * (client-side) search in `shared/src/fts/ftsSearch.ts`, so that the server-side
 * FTS endpoint ranks results identically to local search.
 *
 * ## Keep in sync with the client
 *
 * The BM25 parameters and the word-match field boosts below mirror the defaults
 * in `shared/src/fts/ftsSearch.ts`. The field boosts themselves come from the
 * shared `FTS_FIELDS` config in `ftsIndexing.ts` (single source of truth on the
 * API side — see ADR 0009). If you change BM25 params or field boosts here,
 * change the client search too, or server and client relevance silently diverge.
 * See ADR 0010 (docs/adr/0010-server-side-fts-search.md).
 */

import { FTS_FIELDS, FtsFieldConfig, normalizeText, stripHtml } from "./ftsIndexing";

/** Default number of results returned per page. */
export const FTS_DEFAULT_LIMIT = 20;

/**
 * Trigrams appearing in more than this percentage of the (accessible) corpus are
 * dropped as too common to be useful for ranking. Mirrors the client default.
 */
export const FTS_MAX_TRIGRAM_DOC_PERCENT = 50;

/** BM25 term-frequency saturation parameter (k1). Mirrors the client default. */
export const FTS_BM25_K1 = 1.2;

/** BM25 document-length normalization parameter (b). Mirrors the client default. */
export const FTS_BM25_B = 0.75;

/**
 * Generate trigrams from a search query. Returns a de-duplicated array of the
 * 3-character trigrams found in the query (words of 2 characters or less are
 * skipped). Mirrors `generateSearchTrigrams` in `shared/src/fts/trigram.ts`.
 */
export function generateSearchTrigrams(query: string): string[] {
    const normalized = normalizeText(query);
    if (!normalized) return [];

    const trigrams: string[] = [];
    const seen = new Set<string>();
    const words = normalized.split(" ");

    for (const word of words) {
        if (word.length <= 2) continue;
        for (let i = 0; i <= word.length - 3; i++) {
            const trigram = word.substring(i, i + 3);
            if (!seen.has(trigram)) {
                seen.add(trigram);
                trigrams.push(trigram);
            }
        }
    }

    return trigrams;
}

/**
 * Split a query into the full words used for the word-match bonus.
 * Words of 2 characters or less are ignored (same filter as trigram generation).
 */
export function queryWords(query: string): string[] {
    const normalized = normalizeText(query);
    if (!normalized) return [];
    return normalized.split(" ").filter((w) => w.length > 2);
}

/**
 * BM25 inverse document frequency for a trigram.
 * `n` is the corpus size and `df` the document frequency of the trigram.
 */
export function idf(n: number, df: number): number {
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
}

/**
 * BM25 score for a single document.
 *
 * @param tfMap    trigram -> term frequency for this document (boosted tf, as stored on `fts`)
 * @param dl       document length (the document's `ftsTokenCount`)
 * @param idfMap   trigram -> idf (computed once per query)
 * @param avgdl    average document length across the corpus
 */
export function bm25Score(
    tfMap: Map<string, number>,
    dl: number,
    idfMap: Map<string, number>,
    avgdl: number,
    k1: number = FTS_BM25_K1,
    b: number = FTS_BM25_B,
): number {
    const docLength = dl || 1;
    let score = 0;
    for (const [token, idfValue] of idfMap) {
        const tf = tfMap.get(token) || 0;
        if (tf === 0) continue;
        score += idfValue * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgdl))));
    }
    return score;
}

/**
 * Boost-weighted full-word match bonus across the configured fields.
 * For each field, counts how many query words appear as full words, multiplied
 * by the field's boost, and sums across fields. Mirrors
 * `computeFieldWordMatchScore` in `shared/src/fts/ftsSearch.ts`.
 */
export function wordMatchScore(
    words: string[],
    doc: Record<string, any>,
    fields: FtsFieldConfig[] = FTS_FIELDS,
): number {
    if (words.length === 0) return 0;

    let totalScore = 0;
    for (const field of fields) {
        const value = doc[field.name];
        if (typeof value !== "string" || !value) continue;
        const text = normalizeText(field.isHtml ? stripHtml(value) : value);
        const docWords = new Set(text.split(" "));
        let matches = 0;
        for (const word of words) {
            if (docWords.has(word)) matches++;
        }
        if (matches > 0) {
            totalScore += matches * (field.boost || 1.0);
        }
    }
    return totalScore;
}
