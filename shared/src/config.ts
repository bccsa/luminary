import { ref, Ref } from "vue";
import { Uuid } from "./types";
import { ApiSyncQuery } from "./rest/RestApi";

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
     * OAuth provider ID (document _id) sent as X-Provider-Id header for OIDC trust verification
     */
    providerId?: string;
    /**
     * Array of API Sync queries passed to the shared library, that the client needs to sync down
     */
    syncList?: Array<ApiSyncQuery>;
    /**
     * Array of language IDs of languages to be included in sync
     */
    appLanguageIdsAsRef?: Ref<Uuid[]>;
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
