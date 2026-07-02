/**
 * Retention bookkeeping for offline-persisted below-cutoff Content.
 *
 * As the content sync window slides forward, docs fall below the cutoff and would
 * otherwise accumulate in IndexedDB forever (sync only clamps syncList *state*, it
 * never deletes docs). This module keeps a per-doc keep-alive deadline in the
 * `retention` side table and evicts the stale tail.
 *
 * A doc's deadline is refreshed ("touched") whenever it is served from IndexedDB —
 * persisted by a HybridQuery `persistOffline` supplement, featured in any HybridQuery
 * output, or opened in detail. `evictStaleBelowCutoff` (run after each content sync,
 * so only while online) removes below-cutoff Content whose deadline has passed or was
 * never set.
 *
 * Writes are **deferred and batched**: `touchRetention` only mutates in-memory state
 * and an actively-served doc is re-stamped at most once per `GRANULARITY_MS`; a single
 * `retention.bulkPut` flushes the batch every `FLUSH_INTERVAL_MS`. Stamps live in a
 * side table (not on `docs`) so stamping never rewrites a document — no liveQuery
 * self-churn, no corpus recompute, and a sync/socket doc-rewrite can't clobber a stamp.
 *
 * Distinct from the response cache (`responseCache.ts`): that persists a query's last
 * *window* to localStorage for first-paint; this persists *documents* to IndexedDB for
 * offline durability.
 */

import { DateTime } from "luxon";
import { db, type RetentionEntry } from "./database";
import { config, getContentPublishDateCutoff, getOfflineRetentionTtl } from "../config";
import { DocType } from "../types";
import { OPEN_MIN } from "../api/sync/utils";
import { scheduleCorpusStatsRecompute } from "../fts/ftsIndexer";

/** How often the pending batch is written to the `retention` table. */
const FLUSH_INTERVAL_MS = 10_000;
/** Minimum interval between re-stamps of the same doc (caps write volume). */
const GRANULARITY_MS = 24 * 60 * 60 * 1000; // 1 day
/** Soft cap on the in-memory throttle map; cleared past this to bound memory. */
const MAX_RECENT = 5000;

// docId → retainUntil, awaiting the next flush.
const pending = new Map<string, number>();
// docId → retainUntil last buffered, so a recently-stamped doc isn't re-written every
// recompute. Approximate (in-memory, lost on reload — which just re-stamps next time).
const recentlyStamped = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let hideFlushRegistered = false;

/**
 * Refresh the keep-alive deadline for the given docs (deferred + throttled). Cheap and
 * safe to call on every HybridQuery recompute: in-memory only, no IndexedDB write here.
 */
export function touchRetention(ids: readonly string[]): void {
    if (!ids.length) return;
    registerHideFlush();

    const now = DateTime.now().toMillis();
    const ttl = getOfflineRetentionTtl();
    const granularity = Math.min(GRANULARITY_MS, Math.floor(ttl / 2));
    const retainUntil = now + ttl;

    let added = false;
    for (const id of ids) {
        const known = recentlyStamped.get(id);
        if (known !== undefined && known > now + ttl - granularity) continue; // still fresh
        pending.set(id, retainUntil);
        recentlyStamped.set(id, retainUntil);
        added = true;
    }

    if (recentlyStamped.size > MAX_RECENT) recentlyStamped.clear();
    if (added) scheduleRetentionFlush();
}

function scheduleRetentionFlush(): void {
    if (flushTimer) return; // trailing throttle — fire ~FLUSH_INTERVAL_MS after the first pending touch
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        void flushRetention();
    }, FLUSH_INTERVAL_MS);
}

/** Write the pending stamps in one `bulkPut`. Also invoked before eviction and on hide. */
export async function flushRetention(): Promise<void> {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    if (pending.size === 0) return;
    const entries: RetentionEntry[] = Array.from(pending, ([docId, retainUntil]) => ({
        docId,
        retainUntil,
    }));
    pending.clear();
    try {
        await db.retention.bulkPut(entries);
    } catch (e) {
        console.error("[retention] flush failed:", e);
    }
}

/**
 * Delete below-cutoff Content whose retention deadline has passed (or was never set).
 * Covers both supplement-persisted docs and content that slid out of the sync window.
 * Inert in CMS / when no cutoff is configured. Call only while online (it runs after a
 * content sync) so evicted-but-still-wanted docs can be re-fetched.
 */
export async function evictStaleBelowCutoff(): Promise<void> {
    if (config.cms) return;
    const cutoff = getContentPublishDateCutoff();
    if (cutoff === OPEN_MIN) return; // no cutoff → nothing is "below" it

    await flushRetention(); // don't evict a doc that was just touched but not yet written

    const now = DateTime.now().toMillis();

    // Reap expired retention rows, including ORPHANS — rows whose doc isn't in db.docs
    // (e.g. a viewed online-only article that was stamped but never persisted). The
    // below-cutoff doc pass below only cleans rows for docs it deletes; this catches the
    // rest. Indexed delete on retainUntil, so it's cheap.
    await db.retention.where("retainUntil").belowOrEqual(now).delete();

    const ids = (await db.docs
        .where("publishDate")
        .below(cutoff)
        .and((d) => d.type === DocType.Content)
        .primaryKeys()) as string[];
    if (!ids.length) return;

    const stamps = await db.retention.bulkGet(ids);
    const stale = ids.filter((_id, i) => (stamps[i]?.retainUntil ?? 0) <= now);
    if (!stale.length) return;

    await db.docs.bulkDelete(stale);
    await db.retention.bulkDelete(stale);
    scheduleCorpusStatsRecompute();
}

/**
 * Prune Content in languages the client no longer syncs — e.g. the user un-ticked a language for
 * offline ("Available offline"). Deletes docs in those languages whose retention deadline has
 * passed or was never set, so recently-served / offline-pinned docs survive (they degrade to
 * fetch-on-demand rather than vanishing). Seeks the `language` index per language — no full scan.
 * Inert in CMS. Call after committing a reduced synced set; pruned-but-still-wanted docs are
 * re-fetched on demand by `HybridQuery`.
 */
export async function pruneUnsyncedLanguageContent(languageIds: readonly string[]): Promise<void> {
    if (config.cms || !languageIds.length) return;
    await flushRetention(); // don't prune a doc that was just touched but not yet written
    const now = DateTime.now().toMillis();

    let deletedAny = false;
    for (const language of languageIds) {
        const ids = (await db.docs
            .where("language")
            .equals(language)
            .and((d) => d.type === DocType.Content)
            .primaryKeys()) as string[];
        if (!ids.length) continue;

        const stamps = await db.retention.bulkGet(ids);
        const stale = ids.filter((_id, i) => (stamps[i]?.retainUntil ?? 0) <= now);
        if (!stale.length) continue;

        await db.docs.bulkDelete(stale);
        await db.retention.bulkDelete(stale);
        deletedAny = true;
    }
    if (deletedAny) scheduleCorpusStatsRecompute();
}

/** Best-effort flush of pending stamps when the page is hidden / unloaded. Registered once. */
function registerHideFlush(): void {
    if (hideFlushRegistered) return;
    hideFlushRegistered = true;
    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") void flushRetention();
        });
    }
    if (typeof window !== "undefined") {
        window.addEventListener("pagehide", () => void flushRetention());
    }
}

/** Test helper — clear the in-memory buffer/throttle/timer between tests. */
export function resetRetentionBuffer(): void {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    pending.clear();
    recentlyStamped.clear();
}
