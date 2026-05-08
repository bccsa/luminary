import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getCorpusStats } from "./ftsIndexer";
import { cacheDocs, getCachedDoc, isTrigramIndexReady } from "./trigramIndex";
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

// LRU cache of per-doc normalized word sets.
// stripHtml + normalizeText dominate word-match scoring cost; they depend only on
// the doc's field content, so cache across queries and invalidate on edit via
// `updatedTimeUtc` in the key.
const WORD_SET_CACHE_MAX = 500;
const wordSetCache = new Map<string, Record<string, Set<string>>>();

function getWordSets(doc: ContentDto, fields: FtsFieldConfig[]): Record<string, Set<string>> {
    const key = `${doc._id}:${doc.updatedTimeUtc}`;
    const cached = wordSetCache.get(key);
    if (cached) {
        wordSetCache.delete(key);
        wordSetCache.set(key, cached);
        return cached;
    }
    const sets: Record<string, Set<string>> = {};
    const docRec = doc as Record<string, any>;
    for (const field of fields) {
        const value = docRec[field.name];
        if (typeof value !== "string" || !value) continue;
        const text = normalizeText(field.isHtml ? stripHtml(value) : value);
        sets[field.name] = new Set(text.split(" "));
    }
    wordSetCache.set(key, sets);
    if (wordSetCache.size > WORD_SET_CACHE_MAX) {
        const oldest = wordSetCache.keys().next().value;
        if (oldest !== undefined) wordSetCache.delete(oldest);
    }
    return sets;
}

/**
 * Compute a boost-weighted word match score across fields.
 * For each field, counts how many query words appear as full words,
 * multiplied by the field's boost. Returns the sum across all fields.
 */
function computeFieldWordMatchScore(
    queryWords: string[],
    wordSets: Record<string, Set<string>>,
    fields: FtsFieldConfig[],
): number {
    let totalScore = 0;
    for (const field of fields) {
        const docWords = wordSets[field.name];
        if (!docWords) continue;
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

    const t0 = performance.now();
    const trigrams = generateSearchTrigrams(query);
    const tTrigrams = performance.now();
    if (trigrams.length === 0) return [];

    // Each `await` below is its own implicit IDB tx scoped to just the
    // store(s) it touches. Narrow scopes get granted faster: trigramPostings
    // doesn't have to wait for sync's writes on `db.docs`, and the docs read
    // only enters that contention once we actually need it. Wider single-tx
    // wrappers ended up *slower* in practice because the broader scope means
    // the whole transaction starves until `db.docs` writers clear before any
    // read inside can run.
    const corpusStats = await getCorpusStats();
    const tCorpusStats = performance.now();
    const N = corpusStats.docCount;
    if (N === 0) return [];
    const avgdl = corpusStats.totalTokenCount / N;
    const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));

    // Step 1: trigram → docIds (and tf on the fast path).
    const fastPath = isTrigramIndexReady();
    type TrigramHit = {
        token: string;
        ids: string[];
        /** Per-doc tf for this trigram. Only populated on the fast path. */
        tfByDoc?: Map<string, number>;
    };
    let trigramResults: TrigramHit[];
    if (fastPath) {
        const rows = await db.trigramPostings.bulkGet(trigrams);
        trigramResults = trigrams.map((token, i) => {
            const row = rows[i];
            if (!row) return { token, ids: [] };
            const ids: string[] = new Array(row.postings.length);
            const tfByDoc = new Map<string, number>();
            for (let j = 0; j < row.postings.length; j++) {
                const [docId, tf] = row.postings[j];
                ids[j] = docId;
                tfByDoc.set(docId, tf);
            }
            return { token, ids, tfByDoc };
        });
    } else {
        // Fallback path runs parallel multi-entry-index queries on `db.docs`
        // while the backfill is still building `trigramPostings` after a
        // fresh install. `tf` not available here.
        trigramResults = await Promise.all(
            trigrams.map(async (trigram) => {
                const ids = (await db.docs
                    .where("fts")
                    .between(trigram + ":", trigram + ";", true, false)
                    .primaryKeys()) as string[];
                return { token: trigram, ids };
            }),
        );
    }
    const tTrigramLookup = performance.now();

    const usableTrigrams: Array<{ token: string; df: number; tfByDoc?: Map<string, number> }> = [];
    for (const hit of trigramResults) {
        if (hit.ids.length > maxDocCount) continue;
        usableTrigrams.push({ token: hit.token, df: hit.ids.length, tfByDoc: hit.tfByDoc });
    }
    if (usableTrigrams.length === 0) return [];

    // Step 2: IDF + coarse-rank from postings alone — no doc loads. Score per
    // doc is Σ idf*tf (fast path) or Σ idf (fallback). +20 buffer absorbs
    // reranking by full BM25 / word-match within the loaded window.
    const tCoarseStart = performance.now();
    const idfMap = new Map<string, number>();
    for (const { token, df } of usableTrigrams) {
        idfMap.set(token, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }
    const coarseScore = new Map<string, number>();
    for (const hit of trigramResults) {
        if (hit.ids.length > maxDocCount) continue;
        const idf = idfMap.get(hit.token)!;
        if (hit.tfByDoc) {
            for (const id of hit.ids) {
                const tf = hit.tfByDoc.get(id) ?? 1;
                coarseScore.set(id, (coarseScore.get(id) || 0) + idf * tf);
            }
        } else {
            for (const id of hit.ids) {
                coarseScore.set(id, (coarseScore.get(id) || 0) + idf);
            }
        }
    }
    const matchedCount = coarseScore.size;
    const ranked = Array.from(coarseScore.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    const candidateIds = ranked.slice(0, offset + limit + 20);
    const tCoarseEnd = performance.now();
    if (candidateIds.length === 0) return [];

    // Step 3: hydrate. Cache hits skip IDB; only `bulkGet` the misses. The
    // implicit tx here is scoped to just `db.docs`.
    const tDocsLoadStart = performance.now();
    const docMap = new Map<string, ContentDto>();
    const missingIds: string[] = [];
    for (const id of candidateIds) {
        const cached = getCachedDoc(id);
        if (cached) docMap.set(id, cached);
        else missingIds.push(id);
    }
    let loadedFromIdb = 0;
    if (missingIds.length > 0) {
        const loadedDocs = languageId
            ? await db.docs
                  .where("[language+_id]")
                  .anyOf(missingIds.map((id) => [languageId, id]))
                  .toArray()
            : await db.docs.where("_id").anyOf(missingIds).toArray();
        loadedFromIdb = loadedDocs.length;
        for (const d of loadedDocs) docMap.set(d._id, d as ContentDto);
        cacheDocs(loadedDocs as ContentDto[]);
    }
    const tDocsLoadEnd = performance.now();

    // Step 5: Build per-doc trigram→tf map from fts array, compute BM25.
    // (Pure JS — no IDB. Outside the readonly tx.)
    const tBm25Start = performance.now();
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
    const tBm25End = performance.now();

    // Step 6: Boost-weighted full-word match scoring
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);

    if (queryWords.length > 0 && results.length > 0) {
        for (const result of results) {
            const doc = docMap.get(result.docId);
            if (!doc) continue;

            const wordSets = getWordSets(doc, FTS_FIELDS);
            const wordMatchBonus = computeFieldWordMatchScore(queryWords, wordSets, FTS_FIELDS);
            result.wordMatchScore = wordMatchBonus;
            result.score += wordMatchBonus;
        }
    }
    const tWordMatchEnd = performance.now();

    // Step 7: Sort by combined score desc, then word match desc
    results.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return b.wordMatchScore - a.wordMatchScore;
    });
    const tEnd = performance.now();

    console.log("[ftsSearch]", {
        query,
        trigramCount: trigrams.length,
        path: fastPath ? "trigramPostings" : "multiEntryFallback",
        total_ms: +(tEnd - t0).toFixed(2),
        trigramGen_ms: +(tTrigrams - t0).toFixed(2),
        corpusStats_ms: +(tCorpusStats - tTrigrams).toFixed(2),
        trigramLookup_ms: +(tTrigramLookup - tCorpusStats).toFixed(2),
        coarseRank_ms: +(tCoarseEnd - tCoarseStart).toFixed(2),
        docsLoad_ms: +(tDocsLoadEnd - tDocsLoadStart).toFixed(2),
        bm25_ms: +(tBm25End - tBm25Start).toFixed(2),
        wordMatch_ms: +(tWordMatchEnd - tBm25End).toFixed(2),
        sort_ms: +(tEnd - tWordMatchEnd).toFixed(2),
        usableTrigrams: usableTrigrams.length,
        matchedDocs: matchedCount,
        candidates: candidateIds.length,
        docsCached: candidateIds.length - loadedFromIdb,
        docsLoaded: loadedFromIdb,
        results: results.length,
    });

    return results.slice(offset, offset + limit);
}
