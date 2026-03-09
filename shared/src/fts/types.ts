import type { DocType, Uuid } from "../types";

/** Configuration for a single field to be indexed */
export type FtsFieldConfig = {
    /** Field name on the document (e.g. "title", "text") */
    name: string;
    /** If true, strip HTML tags before indexing */
    isHtml?: boolean;
    /** Boost multiplier for this field (default: 1.0). Higher values make matches in this field more important. */
    boost?: number;
};

/** Options for initializing the FTS system */
export type FtsConfig = {
    /** Which document fields to index */
    fields: FtsFieldConfig[];
    /** Document type to index (e.g. DocType.Content) */
    docType: DocType;
    /** Max percentage of total indexed docs a trigram can appear in before being skipped (default: 50) */
    maxTrigramDocPercent?: number;
    /** Number of documents to index per batch (default: 3) */
    batchSize?: number;
    /** Milliseconds to wait between batches (default: 200) */
    throttleMs?: number;
    /** BM25 k1 parameter controlling term frequency saturation (default: 1.2) */
    bm25k1?: number;
    /** BM25 b parameter controlling document length normalization (default: 0.75) */
    bm25b?: number;
};

/** A single entry in the FTS forward index */
export type FtsIndexEntry = {
    id?: number;
    /** 3-character trigram */
    token: string;
    /** The document ID this entry belongs to */
    docId: Uuid;
    /** Language ID for filtering */
    language: Uuid;
    /** Boosted term frequency: sum of (raw count * field boost) across all fields */
    tf: number;
};

/** Persistent FTS metadata entry */
export type FtsMetaEntry = {
    /** Key name (e.g. "checkpoint", "fieldConfig") */
    id: string;
    value: any;
};

/** Worker command messages */
export type FtsWorkerCommand =
    | { type: "start"; config: FtsConfig }
    | { type: "stop" }
    | { type: "deleteEntries"; docIds: Uuid[] };

/** Worker response messages */
export type FtsWorkerResponse =
    | { type: "progress"; indexed: number; remaining: number }
    | { type: "idle" }
    | { type: "error"; message: string };

/** Search result returned to consumers */
export type FtsSearchResult = {
    docId: Uuid;
    /** Number of matching trigrams */
    score: number;
    /** Number of full query words matched in the document */
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
