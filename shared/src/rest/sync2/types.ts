import { HttpReq } from "../http";

/**
 * Options for sync operations
 */
type SyncBaseOptions = {
    /**
     * Document type or combined type and subtype (e.g., "content:post")
     */
    type: string;
    /**
     * Array of memberOf groups this sync entry applies to
     */
    memberOf: string[];
    /**
     * Array of languages this sync entry applies to (for content document types only)
     */
    languages?: string[];
};

/**
 * Sync list entry type
 */
export type SyncListEntry = SyncBaseOptions & {
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
};

/**
 * Options for sync operations
 */
export type SyncOptions = SyncRunnerOptions & {
    /**
     * Document type to sync
     */
    docType: string;
    /**
     * Parent type to filter by (only for content documents)
     */
    parentType?: string;
    /**
     * If true, this is the initial sync
     */
    initialSync: boolean;
    /**
     * HTTP service to use for API requests
     */
    httpService: HttpReq<any>;
};
