import { ref, Ref } from "vue";
import { Uuid } from "./types";
import { ApiSyncQuery } from "./rest/RestApi";
import type { FtsFieldConfig } from "./fts/types";
import { type DocType } from "./types";

export const changeReqWarnings = ref<string[]>([]);
export const changeReqErrors = ref<string[]>([]);

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
     * Access token
     */
    token?: string;
    /**
     * Array of API Sync queries passed to the shared library, that the client needs to sync down
     */
    syncList?: Array<ApiSyncQuery>;
    /**
     * Array of language IDs of languages to be included in sync
     */
    appLanguageIdsAsRef?: Ref<Uuid[]>;
    /**
     * Full-text search field configuration. If provided, FTS indexing will be enabled.
     * Each entry specifies a document field name and whether it contains HTML.
     */
    ftsFields?: FtsFieldConfig[];
    /**
     * Document type to index for FTS (e.g. DocType.Content). Required when ftsFields is set.
     */
    ftsDocType?: DocType;
    /**
     * Max percentage of total indexed docs a trigram can appear in before being skipped (default: 50)
     */
    ftsMaxTrigramDocPercent?: number;
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
