import { db } from "../db/database";
import { DocType, type ContentDto } from "../types";
import type { FtsCorpusStats } from "./types";

const RECOMPUTE_DEBOUNCE_MS = 10_000;

/** BM25 needs N (doc count) and avgdl (avg doc length). The aggregate is
 *  persisted so search doesn't have to scan all docs per query. */
export async function getCorpusStats(): Promise<FtsCorpusStats> {
    const entry = await db.luminaryInternals.get("corpusStats");
    return entry?.value ?? { totalTokenCount: 0, docCount: 0 };
}

export async function setCorpusStats(stats: FtsCorpusStats): Promise<void> {
    await db.luminaryInternals.put({ id: "corpusStats", value: stats });
}

/** Stream all Content docs via `.each()` to keep memory constant, sum
 *  `ftsTokenCount`, persist the aggregate. */
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

let recomputeTimer: ReturnType<typeof setTimeout> | undefined;

/** Debounced full-corpus recompute. Coalesces a sync burst into a single
 *  scan that fires after `RECOMPUTE_DEBOUNCE_MS` of quiescence. */
export function scheduleCorpusStatsRecompute(): void {
    if (recomputeTimer !== undefined) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => {
        recomputeTimer = undefined;
        recomputeCorpusStats().catch((err) => {
            console.error("[ftsIndexer] corpus stats recompute failed", err);
        });
    }, RECOMPUTE_DEBOUNCE_MS);
}
