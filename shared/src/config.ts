import { ref, Ref } from "vue";
import { Uuid } from "./types";
import { OPEN_MIN } from "./api/sync/utils";

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
    /**
     * How long (ms) a below-cutoff Content document is retained in IndexedDB after it
     * was last viewed / featured / persisted offline, before `evictStaleBelowCutoff`
     * removes it. Bounds the offline document store as the sync window slides.
     * Defaults to 30 days. Only meaningful when `contentPublishDateCutoff` is set.
     */
    offlineRetentionTtlMs?: number;
};

/** Default offline-retention TTL: 30 days. */
const DEFAULT_OFFLINE_RETENTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export let config: SharedConfig;

export function initConfig(newConfig: SharedConfig) {
    config = newConfig;
}

/**
 * Single source of truth for the content publishDate cutoff. Read by sync
 * (which floors content `publishDateMin` to this value) and by `HybridQuery`
 * (which fetches `publishDate <= cutoff` from the API for the older tail).
 * Defaults to `OPEN_MIN` when unset — i.e. no cutoff, full content sync,
 * no older-tail API fetch.
 */
export function getContentPublishDateCutoff(): number {
    return config?.contentPublishDateCutoff ?? OPEN_MIN;
}

/**
 * Whether a content publishDate cutoff is configured. Convenience wrapper around
 * {@link getContentPublishDateCutoff} so callers don't need to know that "no cutoff"
 * is represented as `OPEN_MIN`.
 */
export function hasContentPublishDateCutoff(): boolean {
    return getContentPublishDateCutoff() !== OPEN_MIN;
}

/**
 * TTL (ms) for offline-persisted below-cutoff Content. Read by the retention buffer
 * when stamping a doc's keep-alive deadline. Defaults to 30 days when unset.
 */
export function getOfflineRetentionTtl(): number {
    return config?.offlineRetentionTtlMs ?? DEFAULT_OFFLINE_RETENTION_TTL_MS;
}
