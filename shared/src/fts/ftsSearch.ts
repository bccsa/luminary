import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getCorpusStats } from "./ftsIndexer";
import { flushPendingTrigramChanges } from "./trigramIndex";
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
 * Perform a full-text search using BM25 scoring against the persisted trigram
 * inverted index (`trigramStats` + `trigramPostings` tables).
 *
 * All four IDB reads (corpus stats, trigram stats, trigram postings, candidate
 * docs) run inside a single readonly transaction so we pay the transaction
 * setup cost once per search rather than four times.
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

    const t0 = performance.now();
    const trigrams = generateSearchTrigrams(query);
    const tTrigrams = performance.now();
    if (trigrams.length === 0) return [];

    // Drain any queued trigram-index writes outside the readonly transaction
    // (writes can't run inside `r` mode). No-op when nothing's pending.
    await flushPendingTrigramChanges(db);
    const tFlush = performance.now();

    type UsableTrigram = {
        token: string;
        df: number;
        ids: string[];
        tfByDoc: Map<string, number>;
    };

    type ReadResult = {
        N: number;
        avgdl: number;
        usableTrigrams: UsableTrigram[];
        docMap: Map<string, ContentDto>;
    } | null;

    const phaseTimes = {
        corpusStats: 0,
        statsBulkGet: 0,
        postingsBulkGet: 0,
        postingsParse: 0,
        coarseRank: 0,
        docsLoad: 0,
        usableTrigramCount: 0,
        candidateCount: 0,
        statsRowCount: 0,
        postingsRowCount: 0,
        docsLoaded: 0,
    };

    const tTxStart = performance.now();
    const reads: ReadResult = await db.transaction(
        "r",
        [db.luminaryInternals, db.trigramStats, db.trigramPostings, db.docs],
        async () => {
            // 1. Corpus stats (uses parent transaction via Dexie.currentTransaction)
            const tA = performance.now();
            const corpusStats = await getCorpusStats();
            phaseTimes.corpusStats = performance.now() - tA;
            const N = corpusStats.docCount;
            if (N === 0) return null;
            const avgdl = corpusStats.totalTokenCount / N;
            const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));

            // 2. Stats: tiny rows used to skip common trigrams (df > maxDocCount)
            //    before paying for any postings deserialization.
            const tB = performance.now();
            const statsRows = await db.trigramStats.bulkGet(trigrams);
            phaseTimes.statsBulkGet = performance.now() - tB;
            phaseTimes.statsRowCount = statsRows.filter(Boolean).length;
            const usableTokens: string[] = [];
            const usableDfs: number[] = [];
            for (let i = 0; i < trigrams.length; i++) {
                const stats = statsRows[i];
                if (!stats || stats.df === 0 || stats.df > maxDocCount) continue;
                usableTokens.push(trigrams[i]);
                usableDfs.push(stats.df);
            }
            if (usableTokens.length === 0) return null;

            // 3. Postings: load full posting lists only for usable trigrams.
            const tC = performance.now();
            const postingsRows = await db.trigramPostings.bulkGet(usableTokens);
            phaseTimes.postingsBulkGet = performance.now() - tC;
            phaseTimes.postingsRowCount = postingsRows.filter(Boolean).length;
            const tCParse = performance.now();
            const usableTrigrams: UsableTrigram[] = [];
            for (let k = 0; k < usableTokens.length; k++) {
                const row = postingsRows[k];
                if (!row) continue;
                const tfByDoc = new Map<string, number>();
                const ids: string[] = new Array(row.postings.length);
                for (let j = 0; j < row.postings.length; j++) {
                    const [docId, tf] = row.postings[j];
                    ids[j] = docId;
                    tfByDoc.set(docId, tf);
                }
                usableTrigrams.push({
                    token: usableTokens[k],
                    df: usableDfs[k],
                    ids,
                    tfByDoc,
                });
            }
            phaseTimes.postingsParse = performance.now() - tCParse;
            phaseTimes.usableTrigramCount = usableTrigrams.length;
            if (usableTrigrams.length === 0) return null;

            // Coarse-rank by Σ idf over matched trigrams to pick a page window.
            const tD = performance.now();
            const idfMap = new Map<string, number>();
            for (const { token, df } of usableTrigrams) {
                idfMap.set(token, Math.log((N - df + 0.5) / (df + 0.5) + 1));
            }
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
            phaseTimes.coarseRank = performance.now() - tD;
            phaseTimes.candidateCount = candidateIds.length;
            if (candidateIds.length === 0) return null;

            // 4. Load candidate docs. When a languageId is provided, use the
            //    compound `[language+_id]` index so wrong-language candidates
            //    miss at the IDB layer — no row read, no structured-clone
            //    deserialization for docs we'd discard anyway.
            const tE = performance.now();
            const loadedDocs = languageId
                ? await db.docs
                      .where("[language+_id]")
                      .anyOf(candidateIds.map((id) => [languageId, id]))
                      .toArray()
                : await db.docs.where("_id").anyOf(candidateIds).toArray();
            const docMap = new Map(loadedDocs.map((d) => [d._id, d as ContentDto]));
            phaseTimes.docsLoad = performance.now() - tE;
            phaseTimes.docsLoaded = loadedDocs.length;

            return { N, avgdl, usableTrigrams, docMap };
        },
    );
    const tTxEnd = performance.now();

    if (!reads) {
        const tEnd = performance.now();
        console.log("[ftsSearch]", {
            query,
            trigramCount: trigrams.length,
            total_ms: +(tEnd - t0).toFixed(2),
            trigramGen_ms: +(tTrigrams - t0).toFixed(2),
            flush_ms: +(tFlush - tTrigrams).toFixed(2),
            tx_total_ms: +(tTxEnd - tTxStart).toFixed(2),
            ...phaseTimes,
            note: "no results",
        });
        return [];
    }
    const { N, avgdl, usableTrigrams, docMap } = reads;

    // Pure-JS work below — no IDB.
    const tBm25Start = performance.now();
    const idfMap = new Map<string, number>();
    for (const { token, df } of usableTrigrams) {
        idfMap.set(token, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }

    const results: FtsSearchResult[] = [];
    docMap.forEach((doc, docId) => {
        const dl = doc.ftsTokenCount || 1;
        let score = 0;
        for (const t of usableTrigrams) {
            const tf = t.tfByDoc.get(docId) || 0;
            if (tf === 0) continue;
            const idf = idfMap.get(t.token)!;
            score +=
                idf * ((tf * (bm25k1 + 1)) / (tf + bm25k1 * (1 - bm25b + bm25b * (dl / avgdl))));
        }
        results.push({ docId, score, wordMatchScore: 0, doc });
    });
    const tBm25End = performance.now();

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
    const tWordMatchEnd = performance.now();

    // Step 7: Sort by combined score desc, then word match desc.
    // `results` already represents the page window (Step 3 sliced ranked candidates by
    // [offset, offset+limit+50]), so we just take the first `limit` after re-sorting.
    results.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return b.wordMatchScore - a.wordMatchScore;
    });
    const tEnd = performance.now();

    console.log("[ftsSearch]", {
        query,
        trigramCount: trigrams.length,
        total_ms: +(tEnd - t0).toFixed(2),
        trigramGen_ms: +(tTrigrams - t0).toFixed(2),
        flush_ms: +(tFlush - tTrigrams).toFixed(2),
        tx_total_ms: +(tTxEnd - tTxStart).toFixed(2),
        // Inside-tx phases:
        corpusStats_ms: +phaseTimes.corpusStats.toFixed(2),
        statsBulkGet_ms: +phaseTimes.statsBulkGet.toFixed(2),
        postingsBulkGet_ms: +phaseTimes.postingsBulkGet.toFixed(2),
        postingsParse_ms: +phaseTimes.postingsParse.toFixed(2),
        coarseRank_ms: +phaseTimes.coarseRank.toFixed(2),
        docsLoad_ms: +phaseTimes.docsLoad.toFixed(2),
        // Post-tx phases:
        bm25_ms: +(tBm25End - tBm25Start).toFixed(2),
        wordMatch_ms: +(tWordMatchEnd - tBm25End).toFixed(2),
        sort_ms: +(tEnd - tWordMatchEnd).toFixed(2),
        // Counts (sanity-check what was loaded):
        statsHit: phaseTimes.statsRowCount,
        postingsHit: phaseTimes.postingsRowCount,
        usableTrigrams: phaseTimes.usableTrigramCount,
        candidates: phaseTimes.candidateCount,
        docsLoaded: phaseTimes.docsLoaded,
        results: results.length,
    });

    return results.slice(0, limit);
}
