import type { ContentDto, Uuid } from "../types";
import type { DocType, PublishStatus } from "../types";

/** Configuration for a single field to be indexed or searched */
export type FtsFieldConfig = {
    /** Field name on the document (e.g. "title", "text") */
    name: string;
    /** If true, strip HTML tags before indexing/matching */
    isHtml?: boolean;
    /** Boost multiplier for this field (default: 1.0). Higher values make matches in this field more important. */
    boost?: number;
};

/** Search result returned to consumers */
export type FtsSearchResult = {
    docId: Uuid;
    /** BM25 score plus word match bonus */
    score: number;
    /** Boost-weighted count of full query words matched in document fields */
    wordMatchScore: number;
    /** The matched document. Loaded by ftsSearch during scoring; returned so callers don't have to refetch. */
    doc: ContentDto;
    /**
     * Where this result came from. "local" = offline IndexedDB search; "api" = server-side
     * `/fts` search. NOTE: "api" results carry a trimmed `doc` (no `fts`/`ftsTokenCount`) and
     * are display-only — they must never be written to Dexie (would break offline FTS; ADR 0010).
     */
    source?: "local" | "api";
};

/**
 * Server-side `/fts` result item (mirrors the API's `FtsSearchResultDto`).
 * The `doc` is trimmed of the FTS index fields (`fts`, `ftsTokenCount`) and is display-only —
 * never persist it to Dexie (ADR 0010).
 */
export type ApiFtsResult = {
    docId: Uuid;
    score: number;
    wordMatchScore: number;
    doc: Partial<ContentDto>;
};

/** Document fields a strict (sorted) FTS search can order by. */
export type FtsSortField = "title" | "publishDate" | "expiryDate" | "updatedTimeUtc";

/** Field + direction for strict-mode sorting (replaces relevance ordering). */
export type FtsSort = { field: FtsSortField; direction: "asc" | "desc" };

/** Search options */
export type FtsSearchOptions = {
    query: string;
    languageId?: Uuid;
    /**
     * Restrict to content whose parent type is one of these (e.g. `[DocType.Post]`).
     * Mirrors the `/fts` `types` param. Omit to search all content.
     */
    types?: DocType[];
    /**
     * Restrict to content whose `parentTags` intersect these tag IDs. Mirrors the
     * `/fts` `tags` param.
     */
    tags?: Uuid[];
    /**
     * Restrict to content with this publish status. Mirrors the `/fts` `status`
     * param (server-side this is a CMS-only capability).
     */
    status?: PublishStatus;
    /** Restrict to content with `publishDate >= publishedAfter`. */
    publishedAfter?: number;
    /** Restrict to content with `publishDate <= publishedBefore`. */
    publishedBefore?: number;
    /**
     * Strict mode: keep only docs where every query word (≥3 chars) is a **substring**
     * of `title` or `author` (AND across words). Combined with {@link FtsSearchOptions.sort}
     * this gives a precise, field-ordered "find by name" search instead of fuzzy relevance.
     */
    matchAllWords?: boolean;
    /**
     * Strict mode: order results by this document field/direction instead of by BM25
     * relevance. Applied over the full match set before pagination.
     */
    sort?: FtsSort;
    /** Page size (default: 20) */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Max percentage of total indexed docs a trigram can appear in before being skipped (default: 50) */
    maxTrigramDocPercent?: number;
    /** BM25 k1 parameter controlling term frequency saturation (default: 1.2) */
    bm25k1?: number;
    /** BM25 b parameter controlling document length normalization (default: 0.75) */
    bm25b?: number;
};

/** Aggregate corpus statistics for BM25 scoring */
export type FtsCorpusStats = {
    totalTokenCount: number;
    docCount: number;
};
