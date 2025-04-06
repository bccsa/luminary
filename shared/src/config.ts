import { Ref } from "vue";
import { Uuid } from "./types";
import { ApiDocType } from "./rest/RestApi";

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
     * Array of DocTypes passed to the shared library, that the client need to sync down
     */
    docTypes?: Array<ApiDocType>;
    /**
     * Array of language IDs of languages to be included in sync
     */
    appLanguageIdsAsRef?: Ref<Uuid[]>;
};

export let config: SharedConfig;

export function initConfig(newConfig: SharedConfig) {
    config = newConfig;
}
