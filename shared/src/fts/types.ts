import type { Uuid } from "../types";

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
