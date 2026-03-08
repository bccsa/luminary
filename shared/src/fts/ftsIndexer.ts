import { db } from "../db/database";
import type { ContentDto, DocType } from "../types";
import { generateTrigrams, stripHtml } from "./trigram";
import type { FtsFieldConfig, FtsIndexEntry } from "./types";

/**
 * Extract text from a document based on the configured fields.
 */
function extractText(doc: Record<string, any>, fields: FtsFieldConfig[]): string {
    const parts: string[] = [];
    for (const field of fields) {
        const value = doc[field.name];
        if (typeof value !== "string" || !value) continue;
        parts.push(field.isHtml ? stripHtml(value) : value);
    }
    return parts.join(" ");
}

/**
 * Index a single document. Removes old entries if re-indexing.
 * Returns the number of trigrams written.
 */
export async function indexDocument(
    doc: ContentDto,
    fields: FtsFieldConfig[],
): Promise<number> {
    const text = extractText(doc as unknown as Record<string, any>, fields);
    const trigrams = generateTrigrams(text);

    if (trigrams.size === 0) return 0;

    const negPublishDate = 0 - (doc.publishDate || 0);

    const entries: FtsIndexEntry[] = Array.from(trigrams).map((token) => ({
        token,
        docId: doc._id,
        negPublishDate,
        parentId: doc.parentId,
        language: doc.language,
    }));

    await db.transaction("rw", [db.ftsIndex, db.ftsReverse], async () => {
        // Remove old entries if they exist
        await db.ftsIndex.where("docId").equals(doc._id).delete();

        // Write new entries
        await db.ftsIndex.bulkAdd(entries);

        // Update reverse index
        await db.ftsReverse.put({
            docId: doc._id,
            tokens: Array.from(trigrams),
            indexedAt: doc.updatedTimeUtc,
        });
    });

    return trigrams.size;
}

/**
 * Remove all FTS index entries for a document.
 */
export async function removeDocumentFromIndex(docId: string): Promise<void> {
    await db.transaction("rw", [db.ftsIndex, db.ftsReverse], async () => {
        await db.ftsIndex.where("docId").equals(docId).delete();
        await db.ftsReverse.delete(docId);
    });
}

/**
 * Remove all FTS index entries for multiple documents.
 */
export async function removeDocumentsFromIndex(docIds: string[]): Promise<void> {
    if (docIds.length === 0) return;
    await db.transaction("rw", [db.ftsIndex, db.ftsReverse], async () => {
        await db.ftsIndex.where("docId").anyOf(docIds).delete();
        await db.ftsReverse.bulkDelete(docIds);
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

    let newCheckpoint = checkpoint;
    for (const doc of batch) {
        await indexDocument(doc as ContentDto, fields);
        if (doc.updatedTimeUtc > newCheckpoint) {
            newCheckpoint = doc.updatedTimeUtc;
        }
    }

    // Update checkpoint
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
    await db.transaction("rw", [db.ftsIndex, db.ftsReverse, db.ftsMeta], async () => {
        await db.ftsIndex.clear();
        await db.ftsReverse.clear();
        await db.ftsMeta.put({ id: "checkpoint", value: 0 });
        await db.ftsMeta.put({ id: "fieldConfig", value: fields });
    });

    return true;
}
