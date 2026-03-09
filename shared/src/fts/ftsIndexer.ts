import { db } from "../db/database";
import type { ContentDto, DocType } from "../types";
import { generateTrigramCounts, stripHtml } from "./trigram";
import type { FtsCorpusStats, FtsFieldConfig, FtsIndexEntry } from "./types";

/**
 * Extract text from each configured field separately, preserving boost values.
 */
function extractFieldTexts(
    doc: Record<string, any>,
    fields: FtsFieldConfig[],
): Array<{ text: string; boost: number }> {
    const result: Array<{ text: string; boost: number }> = [];
    for (const field of fields) {
        const value = doc[field.name];
        if (typeof value !== "string" || !value) continue;
        const text = field.isHtml ? stripHtml(value) : value;
        result.push({ text, boost: field.boost ?? 1.0 });
    }
    return result;
}

/**
 * Index a single document. Removes old entries if re-indexing.
 * Returns the number of unique trigrams written and the total token count.
 */
export async function indexDocument(
    doc: ContentDto,
    fields: FtsFieldConfig[],
): Promise<{ trigramCount: number; tokenCount: number }> {
    const fieldTexts = extractFieldTexts(doc as unknown as Record<string, any>, fields);

    // Aggregate boosted TF across all fields
    const aggregatedTf = new Map<string, number>();
    let totalTokenCount = 0;

    for (const { text, boost } of fieldTexts) {
        const { counts, totalCount } = generateTrigramCounts(text);
        totalTokenCount += totalCount;
        counts.forEach((count, trigram) => {
            aggregatedTf.set(trigram, (aggregatedTf.get(trigram) || 0) + count * boost);
        });
    }

    if (aggregatedTf.size === 0) return { trigramCount: 0, tokenCount: 0 };

    const entries: FtsIndexEntry[] = Array.from(aggregatedTf.entries()).map(([token, tf]) => ({
        token,
        docId: doc._id,
        language: doc.language,
        tf,
    }));

    await db.transaction("rw", [db.ftsIndex, db.ftsMeta], async () => {
        // Remove old entries if they exist
        await db.ftsIndex.where("docId").equals(doc._id).delete();

        // Write new entries
        await db.ftsIndex.bulkAdd(entries);

        // Store document length for BM25
        await setDocLength(doc._id, totalTokenCount);
    });

    return { trigramCount: aggregatedTf.size, tokenCount: totalTokenCount };
}

/**
 * Remove all FTS index entries for a document and update corpus stats.
 * All DB reads are inside the transaction to avoid conflicts with Dexie's zone scoping
 * when called from deletion hooks.
 */
export async function removeDocumentFromIndex(docId: string): Promise<void> {
    await db.transaction("rw", [db.ftsIndex, db.ftsMeta], async () => {
        const docLength = await getDocLength(docId);
        await db.ftsIndex.where("docId").equals(docId).delete();
        await deleteDocLength(docId);

        if (docLength > 0) {
            const stats = await getCorpusStats();
            stats.totalTokenCount -= docLength;
            stats.docCount--;
            await setCorpusStats(stats);
        }
    });
}

/**
 * Remove all FTS index entries for multiple documents and update corpus stats.
 * All DB reads are inside the transaction to avoid conflicts with Dexie's zone scoping
 * when called from deletion hooks.
 */
export async function removeDocumentsFromIndex(docIds: string[]): Promise<void> {
    if (docIds.length === 0) return;

    await db.transaction("rw", [db.ftsIndex, db.ftsMeta], async () => {
        const stats = await getCorpusStats();
        let changed = false;

        for (const docId of docIds) {
            const docLength = await getDocLength(docId);
            if (docLength > 0) {
                stats.totalTokenCount -= docLength;
                stats.docCount--;
                changed = true;
            }
        }

        await db.ftsIndex.where("docId").anyOf(docIds).delete();
        for (const docId of docIds) {
            await deleteDocLength(docId);
        }

        if (changed) {
            await setCorpusStats(stats);
        }
    });
}

/**
 * Process a batch of documents for indexing.
 * Reads from the docs table starting from the checkpoint.
 */
export async function indexBatch(
    batchSize: number,
    checkpoint: number,
    fields: FtsFieldConfig[],
    contentDocType: DocType,
): Promise<{ newCheckpoint: number; processedCount: number; hasMore: boolean }> {
    const batch = await db.docs
        .where("[type+updatedTimeUtc]")
        .between([contentDocType, checkpoint + 1], [contentDocType, Infinity])
        .limit(batchSize)
        .toArray();

    if (batch.length === 0) {
        return { newCheckpoint: checkpoint, processedCount: 0, hasMore: false };
    }

    // Load current corpus stats
    const stats = await getCorpusStats();

    let newCheckpoint = checkpoint;
    for (let i = 0; i < batch.length; i++) {
        const doc = batch[i];

        // Yield to the event loop between documents to prevent UI freezes on low-end devices
        if (i > 0) {
            await new Promise<void>((r) => setTimeout(r, 0));
        }

        // Check if doc was previously indexed (re-index case)
        const oldLength = await getDocLength(doc._id);
        if (oldLength > 0) {
            stats.totalTokenCount -= oldLength;
            stats.docCount--;
        }

        const { tokenCount } = await indexDocument(doc as ContentDto, fields);
        if (tokenCount > 0) {
            stats.totalTokenCount += tokenCount;
            stats.docCount++;
        }

        if (doc.updatedTimeUtc > newCheckpoint) {
            newCheckpoint = doc.updatedTimeUtc;
        }
    }

    // Persist updated stats and checkpoint
    await setCorpusStats(stats);
    await setCheckpoint(newCheckpoint);

    return {
        newCheckpoint,
        processedCount: batch.length,
        hasMore: batch.length === batchSize,
    };
}

/**
 * Get the current indexer checkpoint from ftsMeta.
 */
export async function getCheckpoint(): Promise<number> {
    const entry = await db.ftsMeta.get("checkpoint");
    return entry?.value ?? 0;
}

/**
 * Set the indexer checkpoint in ftsMeta.
 */
export async function setCheckpoint(timestamp: number): Promise<void> {
    await db.ftsMeta.put({ id: "checkpoint", value: timestamp });
}

/**
 * Get corpus statistics for BM25 scoring.
 */
export async function getCorpusStats(): Promise<FtsCorpusStats> {
    const entry = await db.ftsMeta.get("corpusStats");
    return entry?.value ?? { totalTokenCount: 0, docCount: 0 };
}

/**
 * Store corpus statistics for BM25 scoring.
 */
export async function setCorpusStats(stats: FtsCorpusStats): Promise<void> {
    await db.ftsMeta.put({ id: "corpusStats", value: stats });
}

/**
 * Store document length (total token count) for BM25 normalization.
 */
async function setDocLength(docId: string, tokenCount: number): Promise<void> {
    await db.ftsMeta.put({ id: `docLen:${docId}`, value: tokenCount });
}

/**
 * Get document length for BM25 normalization. Returns 0 if not found.
 */
async function getDocLength(docId: string): Promise<number> {
    const entry = await db.ftsMeta.get(`docLen:${docId}`);
    return entry?.value ?? 0;
}

/**
 * Delete document length entry.
 */
async function deleteDocLength(docId: string): Promise<void> {
    await db.ftsMeta.delete(`docLen:${docId}`);
}

/**
 * Batch-load document lengths for multiple docs. Returns a Map of docId → tokenCount.
 */
export async function getDocLengths(docIds: string[]): Promise<Map<string, number>> {
    const keys = docIds.map((id) => `docLen:${id}`);
    const entries = await db.ftsMeta.where("id").anyOf(keys).toArray();
    const map = new Map<string, number>();
    for (const entry of entries) {
        const docId = (entry.id as string).slice(7); // remove "docLen:" prefix
        map.set(docId, entry.value);
    }
    return map;
}

/**
 * Get the stored field config from ftsMeta.
 */
export async function getStoredFieldConfig(): Promise<FtsFieldConfig[] | null> {
    const entry = await db.ftsMeta.get("fieldConfig");
    return entry?.value ?? null;
}

/**
 * Store the field config in ftsMeta.
 */
export async function setStoredFieldConfig(fields: FtsFieldConfig[]): Promise<void> {
    await db.ftsMeta.put({ id: "fieldConfig", value: fields });
}

/**
 * Check if the field config has changed, and if so, wipe the index and reset the checkpoint.
 * Returns true if the index was wiped.
 */
export async function checkAndResetIfConfigChanged(fields: FtsFieldConfig[]): Promise<boolean> {
    const stored = await getStoredFieldConfig();

    if (stored && JSON.stringify(stored) === JSON.stringify(fields)) {
        return false;
    }

    // Config changed or first run — wipe and reset
    await db.transaction("rw", [db.ftsIndex, db.ftsMeta], async () => {
        await db.ftsIndex.clear();
        await db.ftsMeta.clear();
        await db.ftsMeta.put({ id: "checkpoint", value: 0 });
        await db.ftsMeta.put({ id: "fieldConfig", value: fields });
        await db.ftsMeta.put({
            id: "corpusStats",
            value: { totalTokenCount: 0, docCount: 0 },
        });
    });

    return true;
}
