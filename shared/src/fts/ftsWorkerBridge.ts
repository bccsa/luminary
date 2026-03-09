import type { FtsConfig } from "./types";
import {
    indexBatch,
    getCheckpoint,
    checkAndResetIfConfigChanged,
    removeDocumentsFromIndex,
} from "./ftsIndexer";

/**
 * Bridge between the main thread and FTS indexing.
 * Indexing is triggered on-demand (startup + when new docs arrive),
 * not by periodic polling.
 */
export class FtsWorkerBridge {
    private stopped = false;
    private running = false;
    private pendingTrigger = false;
    private deleteQueue: string[] = [];
    private config: FtsConfig | null = null;
    private onRunningChange?: (running: boolean) => void;

    /**
     * Set a callback to be notified when the indexing running state changes.
     */
    setOnRunningChange(callback: (running: boolean) => void): void {
        this.onRunningChange = callback;
    }

    /**
     * Start background indexing with the given config.
     */
    async start(config: FtsConfig): Promise<void> {
        this.config = config;
        this.stopped = false;

        // Check if field config changed — wipe index if needed
        await checkAndResetIfConfigChanged(config.fields);

        // Process any pending deletes
        await this.processDeleteQueue();

        // Run initial indexing (catches up if checkpoint < latest doc)
        this.runIndexLoop();
    }

    /**
     * Trigger an indexing run. If already running, a follow-up run
     * will be scheduled to pick up any remaining docs.
     */
    triggerIndexing(): void {
        if (this.stopped) return;
        if (this.running) {
            // Mark that another run is needed after the current one finishes
            this.pendingTrigger = true;
            return;
        }
        this.runIndexLoop();
    }

    /**
     * Stop the indexer.
     */
    stop(): void {
        this.stopped = true;
        this.pendingTrigger = false;
    }

    /**
     * Queue deletion of FTS entries for the given document IDs.
     */
    deleteEntries(docIds: string[]): void {
        this.deleteQueue.push(...docIds);
        // Process immediately if not currently indexing
        if (!this.running) {
            this.processDeleteQueue();
        }
    }

    /**
     * Destroy the bridge and stop all work.
     */
    destroy(): void {
        this.stop();
        this.deleteQueue = [];
        this.config = null;
    }

    private async processDeleteQueue(): Promise<void> {
        if (this.deleteQueue.length === 0) return;
        const docIds = [...this.deleteQueue];
        this.deleteQueue = [];
        await removeDocumentsFromIndex(docIds);
    }

    private async runIndexLoop(): Promise<void> {
        if (this.running || this.stopped || !this.config) return;
        this.running = true;
        this.pendingTrigger = false;

        const { batchSize = 3, throttleMs = 200, fields, docType } = this.config;
        let signalledIndexing = false;

        try {
            let checkpoint = await getCheckpoint();

            // Process any pending deletes
            await this.processDeleteQueue();

            // Check if there's actual work to do
            const firstBatch = await indexBatch(batchSize, checkpoint, fields, docType);
            if (firstBatch.processedCount > 0) {
                signalledIndexing = true;
                this.onRunningChange?.(true);
            }

            checkpoint = firstBatch.newCheckpoint;
            let hasMore = firstBatch.hasMore;

            while (hasMore && !this.stopped) {
                await this.throttle(throttleMs);

                // Process any pending deletes between batches
                await this.processDeleteQueue();

                const result = await indexBatch(batchSize, checkpoint, fields, docType);
                checkpoint = result.newCheckpoint;
                hasMore = result.hasMore;
            }
        } catch (e) {
            console.error("FTS indexing error:", e);
        } finally {
            this.running = false;
            if (signalledIndexing) {
                this.onRunningChange?.(false);
            }
        }

        // If a trigger came in while we were running, do another pass
        if (this.pendingTrigger && !this.stopped) {
            this.pendingTrigger = false;
            this.runIndexLoop();
        }
    }

    private throttle(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
