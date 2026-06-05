/**
 * Response caching for {@link HybridQuery} (opt-in via `{ cache: true }`).
 *
 * Persists a query's last window to `localStorage` so a later mount can **seed the
 * query's two contributions synchronously, before first paint** — the
 * perceived-speed win the app currently hand-rolls per overview page. localStorage
 * (not IndexedDB) is deliberate: a synchronous read needs no race-gating and never
 * contends with sync on IndexedDB (busiest exactly at startup, when the seed
 * matters most).
 *
 * The window is stored **split by source** ({@link CachedWindow}): the `local`
 * docs seed `_local` (which the real Dexie read replaces wholesale), and the
 * older-tail `remote` docs seed `_remote` (which persists until the POST supersedes
 * it). Seeding the *contributions* this way — rather than the merged output — is
 * what stops the seed collapsing to local-only when the Dexie read lands while the
 * API supplement is still in flight.
 *
 * Keys are a **structural fingerprint** of the query (values excluded), so queries
 * that differ only in runtime values (language/pinned id lists, …) share one entry
 * — collapsing the key space to ~one per call-site shape, like the old hand-named
 * keys. See {@link structuralCacheKey}.
 */

import { normalizeSelector, hashString } from "../MangoQuery/templateNormalize";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { BaseDocumentDto } from "../../types";

const STORAGE_PREFIX = "hqcache:";

/**
 * Cap on docs stored per entry (across both buckets), bounding it against
 * localStorage's ~5MB origin budget. Callers pass the query's `$limit`; this is the
 * fallback for unlimited queries. The seed is a first-paint accelerant, so a
 * partial window is fine — the live read fills in the rest.
 */
const DEFAULT_MAX_DOCS = 50;

/**
 * A persisted window, split by the contribution each doc came from so a remount can
 * seed `_local` and `_remote` separately. `local` heads the window (newer); `remote`
 * is the older tail only the API supplies.
 */
export interface CachedWindow<T extends BaseDocumentDto> {
    local: T[];
    remote: T[];
}

/**
 * Structural fingerprint of a MangoQuery. The selector is normalized
 * ({@link normalizeSelector}) so runtime VALUES (language/pinned id lists, etc.)
 * collapse to `{ $__idx }` placeholders, leaving only the SHAPE; `$sort`/`$limit`/
 * `use_index` are folded in verbatim (low-cardinality, structural). Queries that
 * differ only in their variable values therefore share a key.
 *
 * Caveat: two DIFFERENT call sites with an identical shape but a different constant
 * (e.g. `parentTagType` Category vs Topic) collide. That only affects the
 * first-paint seed — the live query supersedes it via `sameWindow`.
 */
export function structuralCacheKey(query: MangoQuery): string {
    const { template } = normalizeSelector(query.selector);
    const skeleton = JSON.stringify({
        t: template,
        s: query.$sort ?? null,
        l: query.$limit ?? null,
        i: query.use_index ?? null,
    });
    return hashString(skeleton);
}

/**
 * Synchronous read of a cached window. Returns `undefined` on a miss, an
 * empty/both-empty entry, or a corrupt / wrong-shape one — so the caller can treat
 * all of them as "no seed".
 */
export function readResponseCache<T extends BaseDocumentDto>(
    key: string,
): CachedWindow<T> | undefined {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed !== "object" ||
            !Array.isArray(parsed.local) ||
            !Array.isArray(parsed.remote)
        ) {
            return undefined;
        }
        if (!parsed.local.length && !parsed.remote.length) return undefined;
        return parsed as CachedWindow<T>;
    } catch {
        return undefined;
    }
}

/**
 * Quota-safe write of a window, capped to `maxDocs` TOTAL across both buckets
 * (defaults to {@link DEFAULT_MAX_DOCS}; pass the query's `$limit`). The local
 * bucket is kept first (it heads the window). On `QuotaExceededError` or a
 * serialization failure it skips caching and drops any stale entry for the key, so
 * the feature degrades to "no seed" and never throws onto the recompute path.
 */
export function writeResponseCache<T extends BaseDocumentDto>(
    key: string,
    window: CachedWindow<T>,
    maxDocs: number | undefined = DEFAULT_MAX_DOCS,
): void {
    try {
        const cap = maxDocs ?? DEFAULT_MAX_DOCS;
        const local = window.local.length > cap ? window.local.slice(0, cap) : window.local;
        const remoteBudget = Math.max(0, cap - local.length);
        const remote =
            window.remote.length > remoteBudget
                ? window.remote.slice(0, remoteBudget)
                : window.remote;
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ local, remote }));
    } catch {
        try {
            localStorage.removeItem(STORAGE_PREFIX + key);
        } catch {
            /* ignore — localStorage unavailable */
        }
    }
}
