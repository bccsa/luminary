import { DocType } from "../../types";
import { HttpReq } from "../http";

/**
 * Options for sync operations
 */
export type SyncBaseOptions = {
    /**
     * Document type
     */
    type: DocType;
    /**
     * Sub type (parentType for content documents or docType for delete commands)
     */
    subType?: DocType;
    /**
     * Array of memberOf groups this sync entry applies to
     */
    memberOf: string[];
    /**
     * Array of languages this sync entry applies to (for content document types only)
     */
    languages?: string[];
    /**
     * Inclusive lower bound for publishDate. Only meaningful for Content (and its DeleteCmd
     * sibling, where it's intentionally OPEN to propagate deletes regardless of the cutoff).
     * For non-Content callers leave undefined — every code path that uses this bound is
     * wrapped in `if (type === Content)` and `resolveRange` treats undefined as OPEN_MIN.
     */
    publishDateMin?: number;
    /**
     * Inclusive upper bound for publishDate. See {@link publishDateMin}.
     */
    publishDateMax?: number;
};

/**
 * Options for creating a sync runner
 */
export type SyncRunnerOptions = SyncBaseOptions & {
    /**
     * Maximum number of documents to fetch per sync operation
     */
    limit: number;
    /**
     * Flag indicating if this is a CMS sync
     */
    cms?: boolean;
    /**
     * If true, include deleteCmd documents in the sync (default is true)
     */
    includeDeleteCmds?: boolean;
};

/**
 * Options for sync operations
 */
export type SyncOptions = SyncRunnerOptions & {
    /**
     * If true, this is the initial sync
     */
    initialSync: boolean;
    /**
     * HTTP service to use for API requests
     */
    httpService: HttpReq<any>;
};

/**
 * Sync list entry type
 */
export type SyncListEntry = {
    /**
     * Chunk type for the sync entry combining the type and parentType / docType fields (e.g. "content:post", "deleteCmd:group")
     */
    chunkType: string;
    /**
     * Array of memberOf groups this sync entry applies to
     */
    memberOf: string[];
    /**
     * Array of languages this sync entry applies to (Content columns only). Two caveats:
     *
     * - **Content columns are no longer language-disjoint.** The Content sync query uses a set-based
     *   priority-fallback keep (`contentLanguageKeepSelector`), so a column keyed on languages `L`
     *   also stores *fallback* docs whose own `language ∉ L` (a post with no `L` translation). Merge
     *   and `trim` key on this declared set, never on the docs' actual languages, so they still work;
     *   the fallback docs are retention-managed like any other. Do not assume `column ⊇ its docs'
     *   languages`.
     * - **DeleteCmd columns are language-UNSCOPED** (`languages: undefined`): a delete of any
     *   downloaded doc — including a non-`L` fallback translation, whose DeleteCmd carries that
     *   language — must propagate, so a single unscoped DeleteCmd column covers every language.
     */
    languages?: string[];
    /**
     * Starting block (updatedTimeUtc) number for the sync range
     */
    blockStart: number;
    /**
     * Ending block (updatedTimeUtc) number for the sync range
     */
    blockEnd: number;
    /**
     * Indicates that the end (oldest available data) of the sync data has been reached
     */
    eof?: boolean;
    /**
     * Inclusive lower bound for publishDate covered by this entry. Only set on Content and
     * DeleteCmd entries — non-Content chunkTypes (Language, Redirect, Storage, AuthProvider,
     * Group, …) leave this undefined since their docs have no publishDate field. `resolveRange`
     * treats undefined as OPEN_MIN, so existing comparisons (filterByTypeMemberOf, mergeHorizontal,
     * findStaleSubsetEntries, findDegenerateChunkTypes) continue to work uniformly.
     */
    publishDateMin?: number;
    /**
     * Inclusive upper bound for publishDate covered by this entry. See {@link publishDateMin}.
     */
    publishDateMax?: number;
};
