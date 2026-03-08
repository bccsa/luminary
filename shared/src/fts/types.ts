import type { DocType, Uuid } from "../types";

/** Configuration for a single field to be indexed */
export type FtsFieldConfig = {
    /** Field name on the document (e.g. "title", "text") */
    name: string;
    /** If true, strip HTML tags before indexing */
    isHtml?: boolean;
};

/** Options for initializing the FTS system */
export type FtsConfig = {
    /** Which document fields to index */
    fields: FtsFieldConfig[];
    /** Document type to index (e.g. DocType.Content) */
    docType: DocType;
    /** Max percentage of total indexed docs a trigram can appear in before being skipped (default: 50) */
    maxTrigramDocPercent?: number;
    /** Number of documents to index per batch (default: 10) */
    batchSize?: number;
    /** Milliseconds to wait between batches (default: 100) */
    throttleMs?: number;
};

/** A single entry in the FTS forward index */
export type FtsIndexEntry = {
    id?: number;
    /** 3-character trigram */
    token: string;
    /** The document ID this entry belongs to */
    docId: Uuid;
    /** 0 - publishDate, for descending sort via ascending index */
    negPublishDate: number;
    /** Parent post/tag ID */
    parentId: Uuid;
    /** Language ID for filtering */
    language: Uuid;
};

/** Reverse index: maps a document to its indexed tokens for efficient deletion */
export type FtsReverseEntry = {
    /** The document ID (primary key) */
    docId: Uuid;
    /** All unique trigrams stored for this doc */
    tokens: string[];
    /** updatedTimeUtc at time of indexing (to detect stale entries) */
    indexedAt: number;
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
    parentId: Uuid;
    negPublishDate: number;
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
};
