import type Dexie from "dexie";
import type { Table } from "dexie";
import { DocType, type ContentDto } from "../types";

/**
 * Persisted inverted FTS index keyed by trigram. Search reads this instead of
 * running per-trigram `between(...)` queries on the multi-entry `*fts` index of
 * `db.docs` — those queries queue behind sync's `bulkPut` writes on `docs`,
 * and on a fresh sync that wait dominates the search latency. `trigramPostings`
 * is updated via debounced flushes from a Dexie hook on `db.docs`, so search
 * reads contend only with infrequent index-update writes (5 s debounce).
 */
export type TrigramPostingsRow = {
    /** Three-character trigram, primary key. */
    trigram: string;
    /** [docId, tf] pairs. df is implicit as postings.length. */
    postings: Array<[string, number]>;
};

/** 5 s of quiescence before we flush the queue, sized to coalesce a sync burst
 *  into one write tx so search reads on `trigramPostings` aren't queued behind
 *  a stream of small updates. Mirrors the corpus-stats debounce. */
const FLUSH_DEBOUNCE_MS = 5_000;

type PendingDocChange = { oldFts: string[]; newFts: string[] };

let pendingChanges = new Map<string, PendingDocChange>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushChain: Promise<void> = Promise.resolve();
let backfilled = false;

/**
 * In-memory LRU cache of loaded `ContentDto`s keyed by `_id`. Lets `ftsSearch`
 * skip the contended `db.docs` bulkGet for docs we already loaded in a recent
 * search (heavy overlap during incremental typing, pagination, language
 * switch). Invalidated by the same Dexie hooks that maintain the trigram
 * index, so a doc write evicts its cache entry before the next search runs.
 */
const DOC_CACHE_MAX = 500;
const docCache = new Map<string, ContentDto>();

export function getCachedDoc(id: string): ContentDto | undefined {
    const doc = docCache.get(id);
    if (doc !== undefined) {
        // refresh LRU recency
        docCache.delete(id);
        docCache.set(id, doc);
    }
    return doc;
}

export function cacheDocs(docs: ContentDto[]): void {
    for (const doc of docs) {
        if (!doc._id) continue;
        docCache.set(doc._id, doc);
    }
    while (docCache.size > DOC_CACHE_MAX) {
        const oldest = docCache.keys().next().value;
        if (oldest === undefined) break;
        docCache.delete(oldest);
    }
}

export function invalidateCachedDoc(id: string): void {
    docCache.delete(id);
}

/**
 * Subset of the Database we touch — keeps this module decoupled from the
 * concrete Database class to avoid a circular import.
 */
export interface TrigramDb extends Dexie {
    docs: Table<any>;
    trigramPostings: Table<TrigramPostingsRow, string>;
}

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
 * Coalesce multiple changes to the same doc within one flush window: keep the
 * original committed state as `oldFts` and overwrite `newFts` with the latest.
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
    // Reset on every change so the flush only fires after the write stream
    // has been quiet for FLUSH_DEBOUNCE_MS — i.e. after sync settles.
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        flushPendingTrigramChanges(db).catch((err) => {
            console.error("[trigramIndex] flush failed", err);
        });
    }, FLUSH_DEBOUNCE_MS);
}

/**
 * Apply queued doc-level changes to `trigramPostings` in one batched
 * read-modify-write. Concurrent callers serialize via `flushChain`.
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
    const touched = Array.from(trigramOps.keys());

    await db.transaction("rw", db.trigramPostings, async () => {
        const existingRows = await db.trigramPostings.bulkGet(touched);
        const upserts: TrigramPostingsRow[] = [];
        const deletes: string[] = [];

        for (let i = 0; i < touched.length; i++) {
            const trigram = touched[i];
            const ops = trigramOps.get(trigram)!;
            const existing = existingRows[i];

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
                upserts.push({ trigram, postings });
            }
        }

        if (deletes.length > 0) await db.trigramPostings.bulkDelete(deletes);
        if (upserts.length > 0) await db.trigramPostings.bulkPut(upserts);
    });
}

/**
 * Install Dexie hooks on the docs table that record fts-affecting changes
 * into the pending queue. Hooks fire for any write source (sync, manual
 * upsert, deleteRevoked, etc.) so the index stays consistent without each
 * call site needing to know about `trigramPostings`.
 */
export function installTrigramHooks(db: TrigramDb): void {
    db.docs.hook("creating", (_pk, obj) => {
        if (!obj || obj.type !== DocType.Content) return;
        invalidateCachedDoc(obj._id);
        const fts = (obj as ContentDto).fts;
        if (!Array.isArray(fts) || fts.length === 0) return;
        recordChange(obj._id, [], fts);
        scheduleFlush(db);
    });

    db.docs.hook("updating", (mods, _pk, obj) => {
        if (!obj) return;
        const after = { ...obj, ...(mods as object) } as ContentDto;
        const id = after._id ?? (obj as any)._id;
        if (id) invalidateCachedDoc(id);
        const isContentNow = after.type === DocType.Content;
        const wasContent = (obj as any).type === DocType.Content;
        if (!isContentNow && !wasContent) return;
        const oldFts =
            wasContent && Array.isArray((obj as ContentDto).fts)
                ? ((obj as ContentDto).fts as string[])
                : [];
        const newFts = isContentNow && Array.isArray(after.fts) ? (after.fts as string[]) : [];
        if (oldFts.length === 0 && newFts.length === 0) return;
        recordChange(id, oldFts, newFts);
        scheduleFlush(db);
    });

    db.docs.hook("deleting", (_pk, obj) => {
        if (!obj) return;
        if (obj._id) invalidateCachedDoc(obj._id);
        if (obj.type !== DocType.Content) return;
        const fts = (obj as ContentDto).fts;
        if (!Array.isArray(fts) || fts.length === 0) return;
        recordChange(obj._id, fts, []);
        scheduleFlush(db);
    });
}

/**
 * Build `trigramPostings` from scratch by scanning every Content doc's fts
 * array. Used on first run after the schema upgrade. Pure rearrangement of
 * existing data — no `stripHtml` / `normalizeText` needed.
 */
export async function backfillTrigramIndex(db: TrigramDb): Promise<void> {
    const accum = new Map<string, Map<string, number>>(); // trigram → docId → tf

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

    const rows: TrigramPostingsRow[] = [];
    accum.forEach((postingsMap, trigram) => {
        const postings: Array<[string, number]> = [];
        postingsMap.forEach((tf, docId) => postings.push([docId, tf]));
        rows.push({ trigram, postings });
    });

    await db.transaction("rw", db.trigramPostings, async () => {
        await db.trigramPostings.clear();
        if (rows.length > 0) await db.trigramPostings.bulkPut(rows);
    });

    backfilled = true;
}

/**
 * Run a backfill if `trigramPostings` is empty but content docs exist. Called
 * from `initDatabase` (background, non-awaited); safe to call repeatedly.
 */
export async function ensureTrigramIndexBuilt(db: TrigramDb): Promise<void> {
    if (backfilled) return;
    const count = await db.trigramPostings.count();
    if (count > 0) {
        backfilled = true;
        return;
    }
    const hasContent = await db.docs.where("type").equals(DocType.Content).first();
    if (!hasContent) {
        backfilled = true; // nothing to build yet; hooks will populate as docs arrive.
        return;
    }
    await backfillTrigramIndex(db);
}

/**
 * True once the backfill has populated `trigramPostings`. Searches before
 * this returns true must fall through to the multi-entry-index path on
 * `db.docs` to avoid returning empty results during the brief startup window.
 */
export function isTrigramIndexReady(): boolean {
    return backfilled;
}

/** Reset module-level state. Used by tests between cases. */
export function resetTrigramIndexState(): void {
    pendingChanges = new Map();
    if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    flushChain = Promise.resolve();
    backfilled = false;
    docCache.clear();
}
