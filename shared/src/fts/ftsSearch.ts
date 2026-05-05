import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getCorpusStats } from "./ftsIndexer";
import type { FtsFieldConfig, FtsSearchOptions, FtsSearchResult } from "./types";
import type { ContentDto } from "../types";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TRIGRAM_DOC_PERCENT = 50;
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

/**
 * FTS field configuration for search-time word match scoring.
 *
 * **IMPORTANT**: This config must be kept in sync with the index-time config in
 * `api/src/util/ftsIndexing.ts`. If you change boost values or fields here,
 * update the other location as well.
 */
const FTS_FIELDS: FtsFieldConfig[] = [
    { name: "title", boost: 3.0 },
    { name: "summary", boost: 1.5 },
    { name: "text", isHtml: true, boost: 1.0 },
    { name: "author", boost: 1.0 },
];

/**
 * Compute a boost-weighted word match score across fields.
 * For each field, counts how many query words appear as full words,
 * multiplied by the field's boost. Returns the sum across all fields.
 */
function computeFieldWordMatchScore(
    queryWords: string[],
    doc: Record<string, any>,
    fields: FtsFieldConfig[],
): number {
    let totalScore = 0;
    for (const field of fields) {
        const value = doc[field.name];
        if (typeof value !== "string" || !value) continue;
        const text = normalizeText(field.isHtml ? stripHtml(value) : value);
        const docWords = new Set(text.split(" "));
        let matches = 0;
        for (const word of queryWords) {
            if (docWords.has(word)) matches++;
        }
        if (matches > 0) {
            totalScore += matches * (field.boost || 1.0);
        }
    }
    return totalScore;
}

/**
 * Perform a full-text search using BM25 scoring via the MultiEntry index on docs.
 * Trigram lookups use `between(trigram + ":", trigram + ";")` on the `*fts` index.
 */
export async function ftsSearch(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    const {
        query,
        languageId,
        limit = DEFAULT_LIMIT,
        offset = 0,
        maxTrigramDocPercent = DEFAULT_MAX_TRIGRAM_DOC_PERCENT,
        bm25k1 = DEFAULT_K1,
        bm25b = DEFAULT_B,
    } = options;

    const trigrams = generateSearchTrigrams(query);
    if (trigrams.length === 0) return [];

    const corpusStats = await getCorpusStats();
    const N = corpusStats.docCount;
    if (N === 0) return [];
    const avgdl = corpusStats.totalTokenCount / N;

    const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));

    // Step 1 (merged from former step1+step3): fetch primaryKeys per trigram in parallel.
    // `df` is derived from `ids.length`, so the previous separate .count() pass is gone.
    const trigramResults = await Promise.all(
        trigrams.map(async (trigram) => {
            const ids = (await db.docs
                .where("fts")
                .between(trigram + ":", trigram + ";", true, false)
                .primaryKeys()) as string[];
            return { token: trigram, ids };
        }),
    );
    const usableTrigrams: Array<{ token: string; df: number; ids: string[] }> = [];
    const matchedDocIds = new Set<string>();
    for (const { token, ids } of trigramResults) {
        if (ids.length > maxDocCount) continue;
        usableTrigrams.push({ token, df: ids.length, ids });
        for (const id of ids) matchedDocIds.add(id);
    }
    if (usableTrigrams.length === 0) return [];

    // Step 2: Compute IDF for each usable trigram
    const idfMap = new Map<string, number>();
    for (const { token, df } of usableTrigrams) {
        idfMap.set(token, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }

    // Step 3: Coarse-rank all candidates by Σ idf over matched trigrams, then slice the
    // page window. Loads only the docs needed for the current page (constant per-page
    // cost regardless of pagination depth) — supports infinite scroll without ballooning
    // K with offset. IDF is the dominant ranking signal for trigram queries, so coarse
    // order tracks exact BM25 closely; final BM25 + word-match still runs on the loaded
    // slice, so within-page ordering matches the full pipeline.
    // Buffer of 50 over `limit` absorbs language-filter shrinkage and any disagreement
    // between coarse and exact scoring at the page boundary.
    const coarseScore = new Map<string, number>();
    for (const { token, ids } of usableTrigrams) {
        const idf = idfMap.get(token)!;
        for (const id of ids) {
            coarseScore.set(id, (coarseScore.get(id) || 0) + idf);
        }
    }
    const ranked = Array.from(coarseScore.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    const candidateIds = ranked.slice(offset, offset + limit + 50);
    if (candidateIds.length === 0) return [];

    // Step 4: Load matched docs, filtering by language at query time so wrong-language
    // docs never enter the scoring/word-match loops below.
    const loadedDocs = await db.docs
        .where("_id")
        .anyOf(candidateIds)
        .and((d) => !languageId || (d as ContentDto).language === languageId)
        .toArray();
    const docMap = new Map(loadedDocs.map((d) => [d._id, d as ContentDto]));

    // Step 5: Build per-doc trigram→tf map from fts array, compute BM25
    const usableTokens = new Set(usableTrigrams.map((t) => t.token));
    const results: FtsSearchResult[] = [];

    docMap.forEach((doc, docId) => {
        const tfMap = new Map<string, number>();
        if (doc.fts) {
            for (const entry of doc.fts) {
                const colonIdx = entry.indexOf(":", 3); // token is always 3 chars
                const token = entry.substring(0, colonIdx);
                if (usableTokens.has(token)) {
                    tfMap.set(token, parseFloat(entry.substring(colonIdx + 1)));
                }
            }
        }

        const dl = doc.ftsTokenCount || 1;
        let score = 0;
        for (const { token } of usableTrigrams) {
            const tf = tfMap.get(token) || 0;
            if (tf === 0) continue;
            const idf = idfMap.get(token)!;
            score +=
                idf * ((tf * (bm25k1 + 1)) / (tf + bm25k1 * (1 - bm25b + bm25b * (dl / avgdl))));
        }

        results.push({ docId, score, wordMatchScore: 0, doc });
    });

    // Step 6: Boost-weighted full-word match scoring
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);

    if (queryWords.length > 0 && results.length > 0) {
        for (const result of results) {
            const doc = docMap.get(result.docId);
            if (!doc) continue;

            const wordMatchBonus = computeFieldWordMatchScore(
                queryWords,
                doc as Record<string, any>,
                FTS_FIELDS,
            );
            result.wordMatchScore = wordMatchBonus;
            result.score += wordMatchBonus;
        }
    }

    // Step 7: Sort by combined score desc, then word match desc.
    // `results` already represents the page window (Step 3 sliced ranked candidates by
    // [offset, offset+limit+50]), so we just take the first `limit` after re-sorting.
    results.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return b.wordMatchScore - a.wordMatchScore;
    });

    return results.slice(0, limit);
}
