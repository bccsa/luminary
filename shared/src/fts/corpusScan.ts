import { db } from "../db/database";
import { DocType, type ContentDto } from "../types";
import { TRIGRAM_LENGTH } from "./trigram";

/**
 * Version of what {@link scanCorpus} counts and how. Raise it when the scan or the trigram rules
 * change, so stats stored by an older build are rescanned on the next start.
 */
export const CORPUS_SCAN_VERSION = 1;

/** Raw counts a corpus scan produces, before they are versioned and stored. */
export type CorpusScanResult = {
    totalTokenCount: number;
    docCount: number;
    /** Every Content doc scanned, indexed or not; compared with the docs table on start. */
    contentCount: number;
    df: Record<string, number>;
};

/**
 * Scan every Content doc and tally the BM25 inputs. Kept apart from the write in
 * `ftsIndexer` so it can run as a worker task: it touches every doc's `fts` array, the
 * largest field in the corpus, and re-runs after each sync batch.
 *
 * Uses the `type` index and streams via `.each()` to keep memory flat.
 */
export async function scanCorpus(): Promise<CorpusScanResult> {
    let totalTokenCount = 0;
    let docCount = 0;
    let contentCount = 0;
    const df: Record<string, number> = {};
    await db.docs
        .where("type")
        .equals(DocType.Content)
        .each((doc) => {
            contentCount++;
            const { ftsTokenCount, fts } = doc as ContentDto;
            if (ftsTokenCount && ftsTokenCount > 0) {
                totalTokenCount += ftsTokenCount;
                docCount++;
            }
            // Entries are "trigram:tf", one per trigram per doc.
            for (const entry of fts ?? []) {
                const token = entry.substring(0, TRIGRAM_LENGTH);
                df[token] = (df[token] ?? 0) + 1;
            }
        });
    return { totalTokenCount, docCount, contentCount, df };
}
