import { ref } from "vue";
import type { SyncListEntry } from "./types";

export const syncList = ref<SyncListEntry[]>([]);
export const syncTolerance = 1000; // Once second tolerance for updatedTimeUtc to avoid missing documents due to API database sync delays
