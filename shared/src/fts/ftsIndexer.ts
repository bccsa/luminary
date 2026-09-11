import { db } from "../db/database";
import { DocType, type ContentDto } from "../types";
import type { FtsCorpusStats } from "./types";

const DOC_FREQUENCY_KEY = "ftsDocFrequency";

type StoredDocFrequency = { version: number; df: Record<string, number> };

let docFrequencyCache: { version: number; df: Map<string, number> } | undefined;

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

/**
 * Number of content docs holding each trigram, as computed with `stats`. Searches read this
 * instead of counting the `fts` index per trigram, which IndexedDB does by walking every
 * matching entry. Undefined when the stats carry no frequencies yet.
 */
export async function getDocFrequencies(
    stats: FtsCorpusStats,
): Promise<Map<string, number> | undefined> {
    const version = stats.docFrequencyVersion;
    if (version === undefined) return undefined;
    if (docFrequencyCache?.version === version) return docFrequencyCache.df;

    const entry = await db.luminaryInternals.get(DOC_FREQUENCY_KEY);
    const stored = entry?.value as StoredDocFrequency | undefined;
    // A recompute may have replaced the stats since they were read.
    if (!stored || stored.version !== version) return undefined;
    docFrequencyCache = { version, df: new Map(Object.entries(stored.df)) };
    return docFrequencyCache.df;
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
    let contentDocCount = 0;
    const df: Record<string, number> = {};
    await db.docs
        .where("type")
        .equals(DocType.Content)
        .each((doc) => {
            contentDocCount++;
            const { ftsTokenCount, fts } = doc as ContentDto;
            if (ftsTokenCount && ftsTokenCount > 0) {
                totalTokenCount += ftsTokenCount;
                docCount++;
            }
            // Entries are "trigram:tf", one per trigram per doc (trigrams are 3 chars).
            for (const entry of fts ?? []) {
                const token = entry.substring(0, entry.indexOf(":", 3));
                df[token] = (df[token] ?? 0) + 1;
            }
        });

    const docFrequencyVersion = Date.now();
    await db.luminaryInternals.put({
        id: DOC_FREQUENCY_KEY,
        value: { version: docFrequencyVersion, df } satisfies StoredDocFrequency,
    });
    await setCorpusStats({ totalTokenCount, docCount, contentDocCount, docFrequencyVersion });
}

/**
 * Schedule a recompute only when the stored stats lack document frequencies or were computed
 * over a different number of content docs than are stored now. Counting reads index keys only,
 * while a recompute reads every content doc.
 */
export async function scheduleCorpusStatsRecomputeIfStale(): Promise<void> {
    const [stats, contentDocCount] = await Promise.all([
        getCorpusStats(),
        db.docs.where("type").equals(DocType.Content).count(),
    ]);
    if (stats.docFrequencyVersion === undefined || stats.contentDocCount !== contentDocCount) {
        scheduleCorpusStatsRecompute();
    }
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
