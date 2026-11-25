import { ref } from "vue";
import type { SyncListEntry, SyncSource } from "./types";

export const syncList = ref<SyncListEntry[]>([]);
/** Enabled only by a recognized capability on the current API connection. */
export const tuplePaginationSupported = ref(false);
export const syncTolerance = 1000; // Once second tolerance for updatedTimeUtc to avoid missing documents due to API database sync delays

/**
 * True while at least one default-source `sync()` runner is in flight. Replaces the
 * legacy `rest/sync.ts` `syncActive` ref (the CMS dashboard "syncing" indicator
 * binds to it). Maintained by an in-flight counter in `sync()`.
 */
export const syncActive = ref(false);

/** Source-scoped sync-list selector (default source when none is provided). */
export const syncListOf = (source?: SyncSource) => source?.syncList ?? syncList;
