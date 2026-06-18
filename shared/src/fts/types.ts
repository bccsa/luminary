import type { ContentDto, Uuid } from "../types";

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

/** Search options */
export type FtsSearchOptions = {
    query: string;
    languageId?: Uuid;
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
