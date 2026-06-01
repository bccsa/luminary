import { ref, Ref } from "vue";
import { Uuid } from "./types";
import { ApiSyncQuery } from "./rest/RestApi";
import { OPEN_MIN } from "./rest/sync2/utils";

export const changeReqWarnings = ref<string[]>([]);
export const changeReqErrors = ref<string[]>([]);

/**
 * Signal emitted when an HTTP request fails with a 5xx status. Consumers
 * (app/CMS) translate this into a user-facing notification — the shared lib
 * does not own user-facing copy. `message` is the raw server-provided message
 * (when present) intended for diagnostics, not direct display.
 */
export type ServerError = {
    status: number;
    message?: string;
};
export const serverError = ref<ServerError | null>(null);

/**
 * Shared configuration object
 */
export type SharedConfig = {
    /**
     * Flag to indicate if the app is a CMS
     */
    cms: boolean;
    /**
     * Indexes to add to the 'docs' table in IndexedDB
     */
    docsIndex: string;
    /**
     * API URL (used for both REST API calls and Socket.io)
     */
    apiUrl: string;
    /**
     * Array of API Sync queries passed to the shared library, that the client needs to sync down
     */
    syncList?: Array<ApiSyncQuery>;
    /**
     * Array of language IDs of languages to be included in sync
     */
    appLanguageIdsAsRef?: Ref<Uuid[]>;
    /**
     * publishDate floor for content. Content older than this is NOT synced and is
     * fetched on demand from the API by `HybridQuery`. Omit (or pass `OPEN_MIN`) for
     * no cutoff (full sync). Apps typically pass a rolling
     * `Date.now() - CONTENT_SYNC_WINDOW_MS`; CMS leaves it unset.
     */
    contentPublishDateCutoff?: number;
};

export let config: SharedConfig;

export function initConfig(newConfig: SharedConfig) {
    // set default values
    newConfig.syncList?.forEach((s) => {
        if (!s.contentOnly) s.contentOnly = false;
        if (s.sync == undefined) s.sync = true;
    });

    config = newConfig;
}

/**
 * Single source of truth for the content publishDate cutoff. Read by sync2
 * (which floors content `publishDateMin` to this value) and by `HybridQuery`
 * (which fetches `publishDate <= cutoff` from the API for the older tail).
 * Defaults to `OPEN_MIN` when unset — i.e. no cutoff, full content sync,
 * no older-tail API fetch.
 */
export function getContentPublishDateCutoff(): number {
    return config?.contentPublishDateCutoff ?? OPEN_MIN;
}
