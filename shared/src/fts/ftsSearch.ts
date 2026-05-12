import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getCorpusStats } from "./ftsIndexer";
import type { FtsFieldConfig, FtsSearchOptions, FtsSearchResult } from "./types";
import type { ContentDto } from "../types";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TRIGRAM_DOC_PERCENT = 50;
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

/** Extra candidates above `offset + limit` that get fully scored, so BM25 +
 *  word-match reranking has room to reorder the top page. */
const RERANK_BUFFER = 20;

/**
 * FTS field configuration for search-time word match scoring.
 *
 * **IMPORTANT**: keep in sync with the index-time config in
 * `api/src/util/ftsIndexing.ts`. Changing boosts or fields here without
 * updating the other side silently drifts query and index behaviour.
 */
const FTS_FIELDS: FtsFieldConfig[] = [
    { name: "title", boost: 3.0 },
    { name: "summary", boost: 1.5 },
    { name: "text", isHtml: true, boost: 1.0 },
    { name: "author", boost: 1.0 },
];

type TrigramHit = {
    token: string;
    ids: string[];
    tfByDoc: Map<string, number>;
};

/**
 * Full-text search using BM25 scoring against the persisted trigram inverted
 * index (`trigramPostings`).
 *
 * Each `await` is its own implicit IDB tx scoped to just the store(s) it
 * touches. Wider single-tx wrappers ended up slower in practice — the broad
 * scope means the whole transaction starves until `db.docs` writers clear
 * before any read inside can run.
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

    const allHits = await lookupTrigrams(trigrams);
    const usableHits = filterCommonTrigrams(allHits, maxDocCount);
    if (usableHits.length === 0) return [];

    const idfMap = buildIdfMap(usableHits, N);
    const candidateIds = coarseRankCandidates(usableHits, idfMap, offset + limit + RERANK_BUFFER);
    if (candidateIds.length === 0) return [];

    const docMap = await hydrateCandidates(candidateIds, languageId);
    const results = scoreCandidates(docMap, usableHits, idfMap, avgdl, bm25k1, bm25b);

    applyWordMatchBonus(results, docMap, extractQueryWords(query));
    sortByScore(results);

    return results.slice(offset, offset + limit);
}

// --- Trigram lookup -------------------------------------------------------

/** One `bulkGet` against `trigramPostings`. Each row gives both the docId
 *  list and the per-doc tf needed for tf-weighted coarse ranking. */
async function lookupTrigrams(trigrams: string[]): Promise<TrigramHit[]> {
    const rows = await db.trigramPostings.bulkGet(trigrams);
    return trigrams.map((token, i) => {
        const row = rows[i];
        const tfByDoc = new Map<string, number>();
        if (!row) return { token, ids: [], tfByDoc };
        const ids: string[] = new Array(row.postings.length);
        for (let j = 0; j < row.postings.length; j++) {
            const [docId, tf] = row.postings[j];
            ids[j] = docId;
            tfByDoc.set(docId, tf);
        }
        return { token, ids, tfByDoc };
    });
}

/** Drop empty hits and trigrams that match more than `maxDocCount` docs.
 *  Common-trigram filtering keeps low-signal tokens from dominating the
 *  candidate set. */
function filterCommonTrigrams(hits: TrigramHit[], maxDocCount: number): TrigramHit[] {
    return hits.filter((hit) => hit.ids.length > 0 && hit.ids.length <= maxDocCount);
}

// --- Ranking --------------------------------------------------------------

/** Standard BM25 IDF: `log((N - df + 0.5) / (df + 0.5) + 1)`. */
function buildIdfMap(usable: TrigramHit[], N: number): Map<string, number> {
    const idfMap = new Map<string, number>();
    for (const { token, ids } of usable) {
        const df = ids.length;
        idfMap.set(token, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }
    return idfMap;
}

/**
 * Pick the top `take` doc IDs by Σ idf*tf over the postings alone — no doc
 * loads. A cheap BM25 approximation used as the candidate-window cut.
 */
function coarseRankCandidates(
    usable: TrigramHit[],
    idfMap: Map<string, number>,
    take: number,
): string[] {
    const score = new Map<string, number>();
    for (const hit of usable) {
        const idf = idfMap.get(hit.token)!;
        for (const id of hit.ids) {
            const tf = hit.tfByDoc.get(id) ?? 1;
            score.set(id, (score.get(id) || 0) + idf * tf);
        }
    }
    return Array.from(score.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, take)
        .map(([id]) => id);
}

// --- Hydration ------------------------------------------------------------

async function hydrateCandidates(
    candidateIds: string[],
    languageId: string | undefined,
): Promise<Map<string, ContentDto>> {
    const loadedDocs = await loadDocsByIds(candidateIds, languageId);
    const docMap = new Map<string, ContentDto>();
    for (const d of loadedDocs) docMap.set(d._id, d);
    return docMap;
}

/** When `languageId` is provided, use the compound `[language+_id]` index
 *  so wrong-language candidates miss at the IDB layer — no row read, no
 *  structured-clone deserialization for docs we'd discard anyway. */
async function loadDocsByIds(
    ids: string[],
    languageId: string | undefined,
): Promise<ContentDto[]> {
    if (languageId) {
        return (await db.docs
            .where("[language+_id]")
            .anyOf(ids.map((id) => [languageId, id]))
            .toArray()) as ContentDto[];
    }
    return (await db.docs.where("_id").anyOf(ids).toArray()) as ContentDto[];
}

// --- BM25 scoring ---------------------------------------------------------

function scoreCandidates(
    docMap: Map<string, ContentDto>,
    usable: TrigramHit[],
    idfMap: Map<string, number>,
    avgdl: number,
    k1: number,
    b: number,
): FtsSearchResult[] {
    const usableTokens = new Set(usable.map((t) => t.token));
    const results: FtsSearchResult[] = [];
    docMap.forEach((doc, docId) => {
        const tfMap = parseDocTfMap(doc, usableTokens);
        const dl = doc.ftsTokenCount || 1;
        const score = bm25Score(tfMap, usable, idfMap, dl, avgdl, k1, b);
        results.push({ docId, score, wordMatchScore: 0, doc });
    });
    return results;
}

/** Parse a doc's `fts` array (`"XYZ:tf"` entries, trigram always 3 chars)
 *  into a tf map, keeping only entries for trigrams in `usableTokens`. */
function parseDocTfMap(doc: ContentDto, usableTokens: Set<string>): Map<string, number> {
    const tfMap = new Map<string, number>();
    if (!doc.fts) return tfMap;
    for (const entry of doc.fts) {
        const token = entry.substring(0, 3);
        if (usableTokens.has(token)) {
            tfMap.set(token, parseFloat(entry.substring(4)));
        }
    }
    return tfMap;
}

/**
 * Okapi BM25 score for one doc:
 * `Σ idf(t) * (tf * (k1+1)) / (tf + k1 * (1 - b + b * dl/avgdl))`.
 *
 * @param tfMap Per-trigram tf for this doc.
 * @param dl    Doc length in tokens (`ftsTokenCount`).
 * @param avgdl Average doc length across the corpus.
 * @param k1    Term-frequency saturation parameter.
 * @param b     Length-normalization parameter.
 */
function bm25Score(
    tfMap: Map<string, number>,
    usable: TrigramHit[],
    idfMap: Map<string, number>,
    dl: number,
    avgdl: number,
    k1: number,
    b: number,
): number {
    let score = 0;
    for (const { token } of usable) {
        const tf = tfMap.get(token) || 0;
        if (tf === 0) continue;
        const idf = idfMap.get(token)!;
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgdl))));
    }
    return score;
}

// --- Word-match bonus -----------------------------------------------------

/** Words ≤2 chars are dropped because they overlap noisily with content. */
function extractQueryWords(query: string): string[] {
    return normalizeText(query)
        .split(" ")
        .filter((w) => w.length > 2);
}

/** Adds a boost-weighted word-match bonus to each result's score and records
 *  it on `wordMatchScore` for use as a sort tiebreaker. Mutates `results`. */
function applyWordMatchBonus(
    results: FtsSearchResult[],
    docMap: Map<string, ContentDto>,
    queryWords: string[],
): void {
    if (queryWords.length === 0 || results.length === 0) return;
    for (const result of results) {
        const doc = docMap.get(result.docId);
        if (!doc) continue;
        const wordSets = buildWordSets(doc, FTS_FIELDS);
        const bonus = computeFieldWordMatchScore(queryWords, wordSets, FTS_FIELDS);
        result.wordMatchScore = bonus;
        result.score += bonus;
    }
}

/** For each field, count how many query words appear as full words and
 *  multiply by the field's boost; sum across fields. */
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

/** Build `{ field → Set<word> }` for `doc`, stripping HTML on `isHtml`
 *  fields and normalizing whitespace/case. */
function buildWordSets(
    doc: ContentDto,
    fields: FtsFieldConfig[],
): Record<string, Set<string>> {
    const sets: Record<string, Set<string>> = {};
    for (const field of fields) {
        const value = (doc as Record<string, any>)[field.name];
        if (typeof value !== "string" || !value) continue;
        const text = normalizeText(field.isHtml ? stripHtml(value) : value);
        sets[field.name] = new Set(text.split(" "));
    }
    return sets;
}

// --- Sort -----------------------------------------------------------------

/** Sort by combined score desc, with `wordMatchScore` as a tiebreaker for
 *  scores within `0.001` (BM25 floats often collide near the top when
 *  several docs share the same trigram set). */
function sortByScore(results: FtsSearchResult[]): void {
    results.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return b.wordMatchScore - a.wordMatchScore;
    });
}
