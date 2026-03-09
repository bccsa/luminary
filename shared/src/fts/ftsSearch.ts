import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getStoredFieldConfig, getCorpusStats, getDocLengths } from "./ftsIndexer";
import type { FtsFieldConfig, FtsSearchOptions, FtsSearchResult } from "./types";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TRIGRAM_DOC_PERCENT = 50;
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

/**
 * Compute a boost-weighted word match score across fields.
 * For each field, counts how many query words appear as full words,
 * multiplied by the field's boost. Returns the sum across all fields.
 * This ensures title matches (boost 3.0) contribute far more than body matches (boost 1.0).
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
 * Perform a full-text search against the FTS index using BM25 scoring.
 * Results are ranked by BM25 score, then full-word matches, then date.
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

    // Load corpus stats for BM25 (single O(1) key lookup)
    const corpusStats = await getCorpusStats();
    const N = corpusStats.docCount;
    if (N === 0) return [];
    const avgdl = corpusStats.totalTokenCount / N;

    const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));

    // Step 1: Filter over-represented trigrams and collect document frequencies
    const usableTrigrams: Array<{ token: string; df: number }> = [];
    for (const trigram of trigrams) {
        const count = await db.ftsIndex.where("token").equals(trigram).count();
        if (count <= maxDocCount) {
            usableTrigrams.push({ token: trigram, df: count });
        }
    }

    if (usableTrigrams.length === 0) return [];

    // Step 2: Compute IDF for each usable trigram
    const idfMap = new Map<string, number>();
    for (const { token, df } of usableTrigrams) {
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        idfMap.set(token, idf);
    }

    // Step 3: Aggregate per-document TF from index entries
    const docData = new Map<
        string,
        {
            tfMap: Map<string, number>;
            language: string;
        }
    >();

    for (const { token } of usableTrigrams) {
        const entries = await db.ftsIndex.where("token").equals(token).toArray();

        for (const entry of entries) {
            let data = docData.get(entry.docId);
            if (!data) {
                data = {
                    tfMap: new Map(),
                    language: entry.language,
                };
                docData.set(entry.docId, data);
            }
            data.tfMap.set(token, entry.tf);
        }
    }

    // Step 4: Batch-load document lengths for matched docs
    const docIds = Array.from(docData.keys());
    const docLengthMap = await getDocLengths(docIds);

    // Step 5: Compute BM25 score per document
    let results: FtsSearchResult[] = [];
    docData.forEach((data, docId) => {
        if (languageId && data.language !== languageId) return;

        const dl = docLengthMap.get(docId) || 1;
        let score = 0;

        for (const { token } of usableTrigrams) {
            const tf = data.tfMap.get(token) || 0;
            if (tf === 0) continue;
            const idf = idfMap.get(token)!;
            // BM25: IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl))
            score +=
                idf * ((tf * (bm25k1 + 1)) / (tf + bm25k1 * (1 - bm25b + bm25b * (dl / avgdl))));
        }

        results.push({
            docId,
            score,
            wordMatchScore: 0,
        });
    });

    // Step 6: Boost-weighted full-word match scoring
    // Adds a significant bonus to documents where query words appear in high-boost fields (e.g. title).
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);

    if (queryWords.length > 0 && results.length > 0) {
        const fields = await getStoredFieldConfig();
        if (fields) {
            const resultDocIds = results.map((r) => r.docId);
            const docs = await db.docs.where("_id").anyOf(resultDocIds).toArray();
            const docMap = new Map(docs.map((d) => [d._id, d]));

            for (const result of results) {
                const doc = docMap.get(result.docId);
                if (!doc) continue;

                const wordMatchBonus = computeFieldWordMatchScore(
                    queryWords,
                    doc as Record<string, any>,
                    fields,
                );
                result.wordMatchScore = wordMatchBonus;
                // Add word match bonus directly to BM25 score so title matches rank higher
                result.score += wordMatchBonus;
            }
        }
    }

    // Step 7: Sort by combined score desc, then word match desc
    results.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return b.wordMatchScore - a.wordMatchScore;
    });

    // Apply pagination
    return results.slice(offset, offset + limit);
}
