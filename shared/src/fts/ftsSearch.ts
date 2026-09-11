import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getCorpusStats, getDocFrequencies } from "./ftsIndexer";
import { cachedPrimaryKeys } from "./indexKeyCache";
import type { FtsFieldConfig, FtsSearchOptions, FtsSearchResult } from "./types";
import type { ContentDto } from "../types";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TRIGRAM_DOC_PERCENT = 50;
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;
/**
 * Compute the (HTML-stripping) word-match bonus only for the top-K documents by BM25.
 * Docs below this rank keep their BM25-only score — they're below the returned page
 * anyway, so the bonus wouldn't change what the user sees but would cost a `stripHtml`
 * per doc. The default cap is `max(offset + limit, WORDMATCH_TOPK)`; callers can set their own
 * with `wordMatchTopK`.
 */
const WORDMATCH_TOPK = 150;
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
    /** docId → trigram → its `"trigram:tf"` entry */
    ftsEntries: Map<string, Map<string, string>>;
    /** `docId:field` → the field's normalised words */
    fieldWords: Map<string, Set<string>>;
};

const newBatch = (): SearchBatch => ({ docs: new Map(), ftsEntries: new Map(), fieldWords: new Map() });

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

function ftsEntries(batch: SearchBatch, doc: ContentDto): Map<string, string> {
    let entries = batch.ftsEntries.get(doc._id);
    if (!entries) {
        entries = new Map();
        for (const entry of doc.fts ?? []) {
            entries.set(entry.substring(0, entry.indexOf(":", 3)), entry); // token is always 3 chars
        }
        batch.ftsEntries.set(doc._id, entries);
    }
    return entries;
}

function fieldWords(batch: SearchBatch, doc: Record<string, any>, field: FtsFieldConfig) {
    const key = `${doc._id}:${field.name}`;
    let words = batch.fieldWords.get(key);
    if (!words) {
        const value = doc[field.name];
        words =
            typeof value === "string" && value
                ? new Set(normalizeText(field.isHtml ? stripHtml(value) : value).split(" "))
                : new Set<string>();
        batch.fieldWords.set(key, words);
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
export function ftsSearch(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    return searchInBatch(options, newBatch());
}

/**
 * Run several searches, one after another, sharing the per-doc work between them: a doc that
 * several searches reach is loaded, split and tokenised once. Results are in `searches` order,
 * each exactly what {@link ftsSearch} returns for those options.
 */
export async function ftsSearchMany(searches: FtsSearchOptions[]): Promise<FtsSearchResult[][]> {
    const batch = newBatch();
    const results: FtsSearchResult[][] = [];
    for (const options of searches) results.push(await searchInBatch(options, batch));
    return results;
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
        if (publishedAfter !== undefined && !(doc.publishDate != null && doc.publishDate >= publishedAfter))
            return;
        if (
            publishedBefore !== undefined &&
            !(doc.publishDate != null && doc.publishDate <= publishedBefore)
        )
            return;
        if (expiresAfter !== undefined && !(doc.expiryDate != null && doc.expiryDate >= expiresAfter))
            return;
        if (
            expiresBefore !== undefined &&
            !(doc.expiryDate != null && doc.expiryDate <= expiresBefore)
        )
            return;

        const entries = ftsEntries(batch, doc);

        const dl = doc.ftsTokenCount || 1;
        let score = 0;
        for (const { token } of keptTrigrams) {
            const entry = entries.get(token);
            const tf = entry ? parseFloat(entry.substring(entry.indexOf(":", 3) + 1)) || 0 : 0;
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

    // Relevance (default): boost-weighted full-word match — only for the top-K by BM25, to
    // bound the per-doc HTML-stripping cost. Docs below the cap keep their BM25-only score.
    if (queryWords.length > 0 && out.length > 0) {
        out.sort((a, b) => b.score - a.score); // pre-rank by BM25 to pick the top-K
        const wmLimit = wordMatchTopK ?? Math.max(offset + limit, WORDMATCH_TOPK);
        const topForWm = out.length > wmLimit ? out.slice(0, wmLimit) : out;
        for (const result of topForWm) {
            const wordMatchBonus = computeFieldWordMatchScore(
                queryWords,
                result.doc as Record<string, any>,
                FTS_FIELDS,
                batch,
            );
            result.wordMatchScore = wordMatchBonus;
            result.score += wordMatchBonus;
        }
    }

    // Sort by combined score desc, then word match desc
    out.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        return b.wordMatchScore - a.wordMatchScore;
    });

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
