import type Dexie from "dexie";
import type { Table } from "dexie";
import { DocType, type ContentDto } from "../types";

/**
 * Persisted inverted FTS index, split across two tables so common-trigram
 * filtering doesn't pay for postings deserialization:
 *
 * - `trigramStats`: tiny `{ trigram, df }` rows used to skip too-common trigrams
 *   (df > maxDocCount) before any postings are loaded.
 * - `trigramPostings`: the actual `[docId, tf]` lists, looked up only for
 *   trigrams that survive the df filter.
 *
 * Per-query lookups become a 2-phase bulkGet: stats first, then postings for
 * the survivors. Each is a B-tree page hit per trigram instead of N cursor
 * scans over the multi-entry `*fts` index.
 */
export type TrigramStatsRow = {
    /** Three-character trigram, primary key. */
    trigram: string;
    /** Document frequency, equal to postings.length on the matching postings row. */
    df: number;
};

export type TrigramPostingsRow = {
    /** Three-character trigram, primary key. */
    trigram: string;
    /** [docId, tf] pairs. */
    postings: Array<[string, number]>;
};

const FLUSH_DEBOUNCE_MS = 100;

type PendingDocChange = { oldFts: string[]; newFts: string[] };

let pendingChanges = new Map<string, PendingDocChange>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushChain: Promise<void> = Promise.resolve();
let backfilled = false;

/**
 * Parse an `fts` array of "trigram:tf" entries into a Map<trigram, tf>.
 */
function parseFtsArray(fts: readonly string[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const entry of fts) {
        const colonIdx = entry.indexOf(":", 3);
        if (colonIdx !== 3) continue;
        const trigram = entry.substring(0, 3);
        const tf = parseFloat(entry.substring(colonIdx + 1));
        if (!Number.isFinite(tf)) continue;
        out.set(trigram, tf);
    }
    return out;
}

/**
 * Record a doc-level change in the pending queue. Coalesces multiple changes
 * to the same doc within a flush window: keeps the original committed state
 * as `oldFts` and overwrites `newFts` with the latest target state.
 */
function recordChange(docId: string, oldFts: string[], newFts: string[]): void {
    const existing = pendingChanges.get(docId);
    if (existing) {
        existing.newFts = newFts;
    } else {
        pendingChanges.set(docId, { oldFts, newFts });
    }
}

function scheduleFlush(db: TrigramDb): void {
    if (flushTimer !== undefined) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        flushPendingTrigramChanges(db).catch((err) => {
            console.error("[trigramIndex] flush failed", err);
        });
    }, FLUSH_DEBOUNCE_MS);
}

/**
 * Subset of the Database we touch — keeps this module decoupled from the
 * concrete Database class to avoid a circular import.
 */
export interface TrigramDb extends Dexie {
    docs: Table<any>;
    trigramStats: Table<TrigramStatsRow, string>;
    trigramPostings: Table<TrigramPostingsRow, string>;
    luminaryInternals: Table<{ id: string; value: any }, string>;
}

/**
 * Apply queued doc-level changes to the trigram tables in one batched
 * read-modify-write. Concurrent callers serialize via `flushChain`, so the
 * latest call always sees a consistent state. Cancels any pending debounce
 * timer so callers (e.g. ftsSearch) can drain on demand.
 */
export function flushPendingTrigramChanges(db: TrigramDb): Promise<void> {
    if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    flushChain = flushChain.then(() => doFlush(db));
    return flushChain;
}

async function doFlush(db: TrigramDb): Promise<void> {
    if (pendingChanges.size === 0) return;

    const changes = pendingChanges;
    pendingChanges = new Map();

    // (trigram → docId → tf | null) where null means remove this docId.
    const trigramOps = new Map<string, Map<string, number | null>>();

    changes.forEach(({ oldFts, newFts }, docId) => {
        const oldMap = parseFtsArray(oldFts);
        const newMap = parseFtsArray(newFts);

        oldMap.forEach((_tf, trigram) => {
            if (!newMap.has(trigram)) {
                let ops = trigramOps.get(trigram);
                if (!ops) {
                    ops = new Map();
                    trigramOps.set(trigram, ops);
                }
                ops.set(docId, null);
            }
        });
        newMap.forEach((tf, trigram) => {
            let ops = trigramOps.get(trigram);
            if (!ops) {
                ops = new Map();
                trigramOps.set(trigram, ops);
            }
            ops.set(docId, tf);
        });
    });

    if (trigramOps.size === 0) return;

    const touched: string[] = [];
    trigramOps.forEach((_ops, trigram) => touched.push(trigram));

    await db.transaction("rw", db.trigramStats, db.trigramPostings, async () => {
        const postingsRows = await db.trigramPostings.bulkGet(touched);
        const postingUpdates: TrigramPostingsRow[] = [];
        const statsUpdates: TrigramStatsRow[] = [];
        const deletes: string[] = [];

        for (let i = 0; i < touched.length; i++) {
            const trigram = touched[i];
            const ops = trigramOps.get(trigram)!;
            const existing = postingsRows[i];

            const postingsMap = new Map<string, number>();
            if (existing) {
                for (let j = 0; j < existing.postings.length; j++) {
                    const pair = existing.postings[j];
                    postingsMap.set(pair[0], pair[1]);
                }
            }
            ops.forEach((tf, docId) => {
                if (tf === null) postingsMap.delete(docId);
                else postingsMap.set(docId, tf);
            });

            if (postingsMap.size === 0) {
                if (existing) deletes.push(trigram);
            } else {
                const postings: Array<[string, number]> = [];
                postingsMap.forEach((tf, docId) => postings.push([docId, tf]));
                postingUpdates.push({ trigram, postings });
                statsUpdates.push({ trigram, df: postings.length });
            }
        }

        if (deletes.length > 0) {
            await db.trigramPostings.bulkDelete(deletes);
            await db.trigramStats.bulkDelete(deletes);
        }
        if (postingUpdates.length > 0) {
            await db.trigramPostings.bulkPut(postingUpdates);
            await db.trigramStats.bulkPut(statsUpdates);
        }
    });
}

/**
 * Install Dexie hooks on the docs table that record fts-affecting changes
 * into the pending queue. The hooks fire for any write source (sync, manual
 * upsert, deleteRevoked, etc.) so the index stays consistent without needing
 * each call site to know about the trigram tables.
 */
export function installTrigramHooks(db: TrigramDb): void {
    db.docs.hook("creating", (_pk, obj) => {
        if (!obj || obj.type !== DocType.Content) return;
        const fts = (obj as ContentDto).fts;
        if (!Array.isArray(fts) || fts.length === 0) return;
        recordChange(obj._id, [], fts);
        scheduleFlush(db);
    });

    db.docs.hook("updating", (mods, _pk, obj) => {
        if (!obj) return;
        const after = { ...obj, ...(mods as object) } as ContentDto;
        const isContentNow = after.type === DocType.Content;
        const wasContent = (obj as any).type === DocType.Content;
        if (!isContentNow && !wasContent) return;
        const oldFts =
            wasContent && Array.isArray((obj as ContentDto).fts)
                ? ((obj as ContentDto).fts as string[])
                : [];
        const newFts = isContentNow && Array.isArray(after.fts) ? (after.fts as string[]) : [];
        if (oldFts.length === 0 && newFts.length === 0) return;
        recordChange(after._id ?? (obj as any)._id, oldFts, newFts);
        scheduleFlush(db);
    });

    db.docs.hook("deleting", (_pk, obj) => {
        if (!obj || obj.type !== DocType.Content) return;
        const fts = (obj as ContentDto).fts;
        if (!Array.isArray(fts) || fts.length === 0) return;
        recordChange(obj._id, fts, []);
        scheduleFlush(db);
    });
}

/**
 * Build the trigram tables from scratch by scanning every Content doc.
 * Used on first run after the schema upgrade and as a recovery if the index
 * gets out of sync.
 */
export async function backfillTrigramIndex(db: TrigramDb): Promise<void> {
    // (trigram → docId → tf)
    const accum = new Map<string, Map<string, number>>();

    await db.docs
        .where("type")
        .equals(DocType.Content)
        .each((doc) => {
            const fts = (doc as ContentDto).fts;
            if (!Array.isArray(fts)) return;
            const docId = doc._id;
            for (const entry of fts) {
                const colonIdx = entry.indexOf(":", 3);
                if (colonIdx !== 3) continue;
                const trigram = entry.substring(0, 3);
                const tf = parseFloat(entry.substring(colonIdx + 1));
                if (!Number.isFinite(tf)) continue;
                let postings = accum.get(trigram);
                if (!postings) {
                    postings = new Map();
                    accum.set(trigram, postings);
                }
                postings.set(docId, tf);
            }
        });

    const postingsRows: TrigramPostingsRow[] = [];
    const statsRows: TrigramStatsRow[] = [];
    accum.forEach((postingsMap, trigram) => {
        const postings: Array<[string, number]> = [];
        postingsMap.forEach((tf, docId) => postings.push([docId, tf]));
        postingsRows.push({ trigram, postings });
        statsRows.push({ trigram, df: postings.length });
    });

    await db.transaction("rw", db.trigramStats, db.trigramPostings, async () => {
        await db.trigramPostings.clear();
        await db.trigramStats.clear();
        if (postingsRows.length > 0) {
            await db.trigramPostings.bulkPut(postingsRows);
            await db.trigramStats.bulkPut(statsRows);
        }
    });

    backfilled = true;
}

/**
 * Run a backfill if the trigram tables are empty but content docs exist.
 * Called from initDatabase; safe to call repeatedly (no-op once populated).
 */
export async function ensureTrigramIndexBuilt(db: TrigramDb): Promise<void> {
    if (backfilled) return;
    const statsCount = await db.trigramStats.count();
    if (statsCount > 0) {
        backfilled = true;
        return;
    }
    const hasContent = await db.docs.where("type").equals(DocType.Content).first();
    if (!hasContent) {
        backfilled = true; // nothing to build yet; hooks will populate as docs arrive
        return;
    }
    await backfillTrigramIndex(db);
}

/**
 * Reset module-level state. Used by tests between cases.
 */
export function resetTrigramIndexState(): void {
    pendingChanges = new Map();
    if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    flushChain = Promise.resolve();
    backfilled = false;
}

