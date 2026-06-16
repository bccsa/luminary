import { ContentDto } from "./ContentDto";

/**
 * A single server-side FTS result.
 *
 * **IMPORTANT — display only, do NOT persist on the client.**
 * `doc` is a trimmed `ContentDto` with the server-side FTS index fields (`fts`,
 * `ftsTokenCount`) stripped to keep the payload lean. Writing these trimmed docs
 * into the client's Dexie `docs` table would leave them un-indexed by the `*fts`
 * MultiEntry index (breaking offline search for those IDs) and would skew the
 * locally-cached `corpusStats`. The result is for rendering online-only results
 * and merging with local results in memory — never for caching as canonical docs.
 * See ADR 0010 (docs/adr/0010-server-side-fts-search.md).
 */
export type FtsSearchResultDto = {
    /** Document ID of the matched content. */
    docId: string;
    /** Combined BM25 + word-match score used for ranking. */
    score: number;
    /** The word-match bonus component of the score (returned for consistent client-side merge ranking). */
    wordMatchScore: number;
    /** Trimmed content document (FTS index fields removed) — display only, not persistable. */
    doc: Partial<ContentDto>;
};
