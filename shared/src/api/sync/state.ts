import { ref } from "vue";
import type { SyncListEntry } from "./types";

export const syncList = ref<SyncListEntry[]>([]);
export const syncTolerance = 1000; // Once second tolerance for updatedTimeUtc to avoid missing documents due to API database sync delays

/**
 * True while at least one top-level `sync()` runner is in flight. Replaces the
 * legacy `rest/sync.ts` `syncActive` ref (the CMS dashboard "syncing" indicator
 * binds to it). Maintained by an in-flight counter in `sync()`.
 */
export const syncActive = ref(false);
