import { db } from "../db/database";
import { TRIGRAM_LENGTH, generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getCorpusStats, getDocFrequencies } from "./ftsIndexer";
import { cachedPrimaryKeys } from "./indexKeyCache";
import type { FtsFieldConfig, FtsSearchOptions, FtsSearchResult } from "./types";
import type { ContentDto } from "../types";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TRIGRAM_DOC_PERCENT = 50;
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;
/**
 * Size of the BM25-ranked blocks the (HTML-stripping) word-match bonus is applied and
 * re-ranked within. Only the blocks a page overlaps are scored, which bounds the
 * `stripHtml` cost and keeps a result's position independent of the requested page.
 * Mirrors the server's `FTS_TOP_K`. `wordMatchTopK` narrows the bonus further, to the top K by
 * BM25 overall.
 */
const WORDMATCH_BLOCK = 150;
/**
 * High-df trigram pruning. After dropping over-common trigrams (`maxTrigramDocPercent`),
 * keep only the most discriminative (lowest-df) remaining trigrams within a df budget
 * (a trigram's df ≈ the docs it contributes to the matched set). Common trigrams add many
 * matches but little ranking signal (low IDF), so dropping them shrinks the matched-doc
 * set — and thus the doc load and scoring — with minimal ranking impact. `PRUNE_MIN_TRIGRAMS`
 * is a floor so short/uncommon queries still match. Mirrors the server-side pruning.
 */
const PRUNE_DF_BUDGET = 3000;
const PRUNE_MIN_TRIGRAMS = 3;

/**
 * High-df trigram pruning: keep the most discriminative (lowest-df) trigrams within a df
 * budget, always keeping at least `minTrigrams` of the rarest even if that exceeds the
 * budget. A trigram's df ≈ the docs it contributes, so this bounds the matched-doc set.
 * Exported for unit testing. Mirrors the server-side pruning.
 */
export function selectTrigramsWithinDfBudget<T extends { df: number }>(
    usable: T[],
    budget: number = PRUNE_DF_BUDGET,
    minTrigrams: number = PRUNE_MIN_TRIGRAMS,
): T[] {
    const rankedByDf = [...usable].sort((a, b) => a.df - b.df);
    let dfBudget = 0;
    const kept: T[] = [];
    for (const t of rankedByDf) {
        if (kept.length >= minTrigrams && dfBudget + t.df > budget) break;
        kept.push(t);
        dfBudget += t.df;
    }
    return kept;
}

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
 * Per-doc work shared by the searches of one batch: each doc is read, its `fts` array split and
 * its fields tokenised once, however many of the batch's searches reach it.
 */
type SearchBatch = {
    docs: Map<string, ContentDto>;
    /**
     * docId → trigram → its `"trigram:tf"` entry. Absent for a batch of one search: no other
     * search would reuse it, and holding every entry of every candidate doc costs time and memory.
     */
    ftsEntries?: Map<string, Map<string, string>>;
    /** `docId:field` → the field's normalised words. Absent for a batch of one search. */
    fieldWords?: Map<string, ReadonlySet<string>>;
};

const newBatch = (searchCount: number): SearchBatch =>
    searchCount > 1
        ? { docs: new Map(), ftsEntries: new Map(), fieldWords: new Map() }
        : { docs: new Map() };

/** Docs by id, in id order, reading from IndexedDB only those the batch has not loaded yet. */
async function loadDocs(batch: SearchBatch, ids: string[]): Promise<ContentDto[]> {
    const missing = ids.filter((id) => !batch.docs.has(id));
    if (missing.length > 0) {
        const loaded = await db.docs.where("_id").anyOf(missing).toArray();
        for (const doc of loaded) batch.docs.set(doc._id, doc as ContentDto);
    }
    return ids
        .slice()
        .sort()
        .flatMap((id) => batch.docs.get(id) ?? []);
}

/** The doc's `"trigram:tf"` entries by trigram; only the `wanted` ones unless the batch shares them. */
function ftsEntries(
    batch: SearchBatch,
    doc: ContentDto,
    wanted: Map<string, unknown>,
): Map<string, string> {
    let entries = batch.ftsEntries?.get(doc._id);
    if (!entries) {
        entries = new Map();
        for (const entry of doc.fts ?? []) {
            const token = entry.substring(0, TRIGRAM_LENGTH);
            if (batch.ftsEntries || wanted.has(token)) entries.set(token, entry);
        }
        batch.ftsEntries?.set(doc._id, entries);
    }
    return entries;
}

/** Shared by every field with no text, instead of a new empty set per doc and field. */
const NO_WORDS: ReadonlySet<string> = new Set();

function fieldWords(
    batch: SearchBatch,
    doc: Record<string, any>,
    field: FtsFieldConfig,
): ReadonlySet<string> {
    // The key is only built when a batch shares the words; a single search never reads it back.
    const key = batch.fieldWords ? `${doc._id}:${field.name}` : undefined;
    let words = key ? batch.fieldWords?.get(key) : undefined;
    if (!words) {
        const value = doc[field.name];
        words =
            typeof value === "string" && value
                ? new Set(normalizeText(field.isHtml ? stripHtml(value) : value).split(" "))
                : NO_WORDS;
        if (key) batch.fieldWords?.set(key, words);
    }
    return words;
}

/**
 * Compute a boost-weighted word match score across fields.
 * For each field, counts how many query words appear as full words,
 * multiplied by the field's boost. Returns the sum across all fields.
 */
function computeFieldWordMatchScore(
    queryWords: string[],
    doc: Record<string, any>,
    fields: FtsFieldConfig[],
    batch: SearchBatch,
): number {
    let totalScore = 0;
    for (const field of fields) {
        const docWords = fieldWords(batch, doc, field);
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
export function ftsSearchLocal(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    return searchInBatch(options, newBatch(1));
}

/**
 * Run several searches, one after another, sharing the per-doc work between them: a doc that
 * several searches reach is loaded, split and tokenised once. Results are in `searches` order,
 * each exactly what {@link ftsSearchLocal} returns for those options.
 */
export async function ftsSearchManyLocal(
    searches: FtsSearchOptions[],
): Promise<FtsSearchResult[][]> {
    const batch = newBatch(searches.length);
    const results: FtsSearchResult[][] = [];
    for (const options of searches) results.push(await searchInBatch(options, batch));
    return results;
}

/**
 * Drops `fts`/`ftsTokenCount` from each result's doc. They are the largest fields on a
 * `ContentDto` and no caller reads them, so carrying them across a worker's structured clone is
 * pure cost. Trimmed results must never be persisted — a doc written back without its trigrams
 * would fall out of the offline `*fts` index (the same rule as server-side results, ADR 0011).
 */
export function trimFtsResults(results: FtsSearchResult[]): FtsSearchResult[] {
    return results.map((result) => {
        const doc = { ...result.doc };
        delete doc.fts;
        delete doc.ftsTokenCount;
        return { ...result, doc };
    });
}

async function searchInBatch(
    options: FtsSearchOptions,
    batch: SearchBatch,
): Promise<FtsSearchResult[]> {
    const {
        query,
        languageId,
        types,
        tags,
        status,
        publishedAfter,
        publishedBefore,
        expiresAfter,
        expiresBefore,
        matchAllWords,
        sort,
        limit = DEFAULT_LIMIT,
        offset = 0,
        wordMatchTopK,
        maxTrigramDocPercent = DEFAULT_MAX_TRIGRAM_DOC_PERCENT,
        bm25k1 = DEFAULT_K1,
        bm25b = DEFAULT_B,
    } = options;

    // Optional non-language filters, applied per-doc during scoring (Step 6). Kept
    // identical in intent to the server `/fts` path (api/src/endpoints/ftsSearch.service.ts)
    // so local and API results agree. `null`/empty filters are treated as "no filter".
    const typeSet = types && types.length ? new Set<string>(types) : undefined;
    const tagSet = tags && tags.length ? new Set<string>(tags) : undefined;

    const trigrams = generateSearchTrigrams(query);
    if (trigrams.length === 0) return [];

    const corpusStats = await getCorpusStats();
    const N = corpusStats.docCount;
    if (N === 0) return [];
    const avgdl = corpusStats.totalTokenCount / N;

    const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));

    // Step 1: Docs per trigram, from the frequencies stored with the corpus stats when present
    // (counting the index walks every matching entry), then drop over-common ones.
    const docFrequencies = await getDocFrequencies(corpusStats);
    const counts = docFrequencies
        ? trigrams.map((token) => ({ token, df: docFrequencies.get(token) ?? 0 }))
        : await Promise.all(
              trigrams.map(async (token) => ({
                  token,
                  df: await db.docs
                      .where("fts")
                      .between(token + ":", token + ";", true, false)
                      .count(),
              })),
          );
    const usableTrigrams = counts.filter((c) => c.df <= maxDocCount);
    if (usableTrigrams.length === 0) return [];

    // Step 2: High-df pruning — keep the most discriminative (lowest-df) trigrams.
    const keptTrigrams = selectTrigramsWithinDfBudget(usableTrigrams);

    // Step 3: Compute IDF for each kept trigram
    const idfMap = new Map<string, number>();
    for (const { token, df } of keptTrigrams) {
        idfMap.set(token, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }

    // Step 4: Collect matching doc IDs across the kept trigrams (in parallel)
    const idArrays = await Promise.all(
        keptTrigrams.map(({ token }) =>
            cachedPrimaryKeys(`fts:${token}`, () =>
                db.docs
                    .where("fts")
                    .between(token + ":", token + ";", true, false)
                    .primaryKeys(),
            ),
        ),
    );
    const matchedDocIds = new Set<string>();
    for (const ids of idArrays) for (const id of ids) matchedDocIds.add(id as string);

    // Step 5: Restrict the matched IDs to the requested language BEFORE loading, so we
    // don't read (and deserialize the large `fts` array of) docs the language filter would
    // discard. `where("language")` is an index-only scan that returns IDs, not docs.
    let candidateIds = Array.from(matchedDocIds);
    if (languageId) {
        const languageIds = new Set<string>(
            await cachedPrimaryKeys(`language:${languageId}`, () =>
                db.docs.where("language").equals(languageId).primaryKeys(),
            ),
        );
        candidateIds = candidateIds.filter((id) => languageIds.has(id));
    }
    const loadedDocs = await loadDocs(batch, candidateIds);
    const docMap = new Map(loadedDocs.map((d) => [d._id, d]));

    // Step 6: Read each kept trigram's tf from the doc's fts entries, compute BM25
    const results: FtsSearchResult[] = [];

    docMap.forEach((doc, docId) => {
        if (languageId && doc.language !== languageId) return;

        // Non-language filters (parity with the server `/fts` path).
        if (typeSet && !typeSet.has(doc.parentType as unknown as string)) return;
        if (tagSet && !(doc.parentTags ?? []).some((t) => tagSet.has(t))) return;
        if (status !== undefined && doc.status !== status) return;
        if (
            publishedAfter !== undefined &&
            !(doc.publishDate != null && doc.publishDate >= publishedAfter)
        )
            return;
        if (
            publishedBefore !== undefined &&
            !(doc.publishDate != null && doc.publishDate <= publishedBefore)
        )
            return;
        if (
            expiresAfter !== undefined &&
            !(doc.expiryDate != null && doc.expiryDate >= expiresAfter)
        )
            return;
        if (
            expiresBefore !== undefined &&
            !(doc.expiryDate != null && doc.expiryDate <= expiresBefore)
        )
            return;

        const entries = ftsEntries(batch, doc, idfMap);

        const dl = doc.ftsTokenCount || 1;
        let score = 0;
        for (const { token } of keptTrigrams) {
            const entry = entries.get(token);
            const tf = entry ? parseFloat(entry.substring(TRIGRAM_LENGTH + 1)) || 0 : 0;
            if (tf === 0) continue;
            const idf = idfMap.get(token)!;
            score +=
                idf * ((tf * (bm25k1 + 1)) / (tf + bm25k1 * (1 - bm25b + bm25b * (dl / avgdl))));
        }

        results.push({ docId, score, wordMatchScore: 0, doc });
    });

    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);

    // Strict mode: keep only docs whose `title`/`author` contains every query word as a
    // substring (partial match, AND across words). Matching docs were surfaced via their
    // (rare) trigrams above; this substring check is the precise filter. Title/author are
    // small, so no HTML strip / body read is needed — and the server mirrors this exactly.
    const out = matchAllWords
        ? results.filter((r) => docMatchesAllWords(r.doc, queryWords))
        : results;

    // Strict sort: order the full match set by the chosen field, then paginate. No BM25 /
    // word-match bonus (relevance is not the ordering here).
    if (sort) {
        sortByField(out, sort.field, sort.direction);
        return out.slice(offset, offset + limit);
    }

    // Relevance (default): pre-rank by BM25, then add the boost-weighted full-word match and
    // re-rank a block at a time. The score tolerance is not transitive, so each block is
    // sorted on its own to order it the same whichever page asked for it.
    out.sort((a, b) => b.score - a.score || (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
    const blockStart = Math.floor(offset / WORDMATCH_BLOCK) * WORDMATCH_BLOCK;
    const blockEnd = Math.ceil((offset + limit) / WORDMATCH_BLOCK) * WORDMATCH_BLOCK;
    // A fixed rank cutoff, so it doesn't make a result's score depend on the page either.
    const wordMatchCap = wordMatchTopK ?? Infinity;
    for (let i = blockStart; i < Math.min(blockEnd, out.length); i += WORDMATCH_BLOCK) {
        const block = out.slice(i, i + WORDMATCH_BLOCK);
        if (queryWords.length > 0) {
            const scored = Math.min(block.length, wordMatchCap - i);
            for (let j = 0; j < scored; j++) {
                const result = block[j];
                result.wordMatchScore = computeFieldWordMatchScore(
                    queryWords,
                    result.doc as Record<string, any>,
                    FTS_FIELDS,
                    batch,
                );
                result.score += result.wordMatchScore;
            }
        }
        block.sort((a, b) => {
            if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
            return b.wordMatchScore - a.wordMatchScore;
        });
        out.splice(i, block.length, ...block);
    }

    return out.slice(offset, offset + limit);
}

/**
 * Strict-mode predicate: every query word (already normalized, ≥3 chars) must appear as a
 * **substring** of the doc's `title` or `author` (normalized). Substring ⇒ partial/typeahead
 * matching ("sund" matches "Sunday"); AND across words. Kept identical to the server `/fts`
 * strict path so local and API agree.
 */
function docMatchesAllWords(doc: ContentDto, queryWords: string[]): boolean {
    if (queryWords.length === 0) return false;
    const title = normalizeText(doc.title ?? "");
    const author = normalizeText((doc as Record<string, any>).author ?? "");
    return queryWords.every((w) => title.includes(w) || author.includes(w));
}

/**
 * Order results in place by a document field. Missing/null values sort last (both
 * directions); ties break by `docId` for a deterministic, server-mirrorable order.
 * Strings compare case-insensitively.
 */
function sortByField(
    results: FtsSearchResult[],
    field: "title" | "publishDate" | "expiryDate" | "updatedTimeUtc",
    direction: "asc" | "desc",
): void {
    const dir = direction === "asc" ? 1 : -1;
    const norm = (v: unknown): any => (typeof v === "string" ? v.toLowerCase() : v);
    results.sort((a, b) => {
        const av = norm((a.doc as Record<string, any>)[field]);
        const bv = norm((b.doc as Record<string, any>)[field]);
        const an = av == null;
        const bn = bv == null;
        if (an || bn) {
            if (an && bn) return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
            return an ? 1 : -1; // nulls last, regardless of direction
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
    });
}
