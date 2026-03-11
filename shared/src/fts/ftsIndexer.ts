import { db } from "../db/database";
import { DocType, type ContentDto } from "../types";
import type { FtsCorpusStats } from "./types";

/**
 * Get corpus statistics for BM25 scoring.
 */
export async function getCorpusStats(): Promise<FtsCorpusStats> {
    const entry = await db.luminaryInternals.get("corpusStats");
    return entry?.value ?? { totalTokenCount: 0, docCount: 0 };
}

/**
 * Store corpus statistics for BM25 scoring.
 */
export async function setCorpusStats(stats: FtsCorpusStats): Promise<void> {
    await db.luminaryInternals.put({ id: "corpusStats", value: stats });
}

let recomputeTimer: ReturnType<typeof setTimeout> | undefined;
const RECOMPUTE_DEBOUNCE_MS = 10_000;

/**
 * Recompute corpus stats from scratch by scanning all Content docs.
 * Uses the existing `type` index on the docs table for efficient filtering.
 * Streams docs via `.each()` to keep memory usage constant.
 */
export async function recomputeCorpusStats(): Promise<void> {
    let totalTokenCount = 0;
    let docCount = 0;
    await db.docs
        .where("type")
        .equals(DocType.Content)
        .each((doc) => {
            const tokenCount = (doc as ContentDto).ftsTokenCount;
            if (tokenCount && tokenCount > 0) {
                totalTokenCount += tokenCount;
                docCount++;
            }
        });
    await setCorpusStats({ totalTokenCount, docCount });
}

/**
 * Schedule a debounced corpus stats recomputation.
 * Ensures only one recomputation fires 10 seconds after the last call.
 */
export function scheduleCorpusStatsRecompute(): void {
    if (recomputeTimer !== undefined) {
        clearTimeout(recomputeTimer);
    }
    recomputeTimer = setTimeout(() => {
        recomputeTimer = undefined;
        recomputeCorpusStats();
    }, RECOMPUTE_DEBOUNCE_MS);
}
