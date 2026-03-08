import { ref } from "vue";
import { FtsWorkerBridge } from "./ftsWorkerBridge";
import type { FtsConfig } from "./types";

let bridge: FtsWorkerBridge | null = null;

/** Reactive ref indicating whether FTS indexing is currently running */
export const ftsIndexing = ref(false);

/**
 * Initialize the FTS system. Creates the worker bridge and starts background indexing.
 */
export function initFts(config: FtsConfig): void {
    if (bridge) {
        bridge.destroy();
    }

    bridge = new FtsWorkerBridge();
    bridge.setOnRunningChange((running) => {
        ftsIndexing.value = running;
    });
    bridge.start(config);
}

/**
 * Notify the FTS system that new or updated documents have been received.
 * Triggers an indexing run to pick up the new docs.
 */
export function ftsNotifyUpdated(): void {
    if (!bridge) return;
    bridge.triggerIndexing();
}

/**
 * Notify the FTS system that documents have been deleted.
 * Called from database.ts deletion paths (bulkPut, deleteRevoked, deleteExpired).
 */
export function ftsNotifyDeleted(docIds: string[]): void {
    if (!bridge || docIds.length === 0) return;
    bridge.deleteEntries(docIds);
}

/**
 * Stop and clean up the FTS system.
 */
export function destroyFts(): void {
    if (bridge) {
        bridge.destroy();
        bridge = null;
    }
}
