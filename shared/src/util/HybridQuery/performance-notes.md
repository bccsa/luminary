# Performance notes — low-end device audit

Audit date: 2026-05-26
Scope: the changes that introduced `publishDate` as a sync column dimension
(Part A — `shared/src/api/sync/`) and the `hybridQuery` module
(Part B — `shared/src/util/hybridQuery/`).

This is a point-in-time review against budget-device constraints (limited RAM,
slow CPU, slow IndexedDB I/O, metered/flaky network). None of the findings are
correctness bugs — the code as shipped works. They are throughput and
responsiveness issues that show up most on budget Android, older iPhones, and
low-memory ChromeOS devices.

> The audit's Critical (#1–#3) and High (#4–#8) findings have been resolved
> in-tree — see the commit that removed them from this file for the per-item
> fixes. The items below are the remaining (Medium-severity) optimisations,
> left open for future profiling. Original audit numbers are kept so they stay
> traceable against that commit; the gaps (#1–#8, and #12 — see Verified
> non-issues) are intentional.

## Open items (Medium severity)

### 9. Column explosion on broaden + many dimensions
[sync.ts:186-234](../../api/sync/sync.ts#L186-L234)

`N_groups × N_languages × N_publishDate_windows` is the upper bound on
simultaneously-active columns. Each `await _sync({...})` is sequential, so
total time scales linearly. A user in 5 groups × 5 langs × 3 publishDate
ranges = 75 sync chains in series. On a low-end device with slow IndexedDB
writes (~50 ms per `bulkPut`) this feels sluggish before horizontal merge
collapses them. The pre-existing `mergeHorizontal` is `O(N²)` in EOF chunks,
so the cleanup cost also grows.

### 10. `subtractRanges` allocates 3 intermediate arrays per call
[utils.ts:63-97](../../api/sync/utils.ts#L63-L97)

Called from `_sync` on each publishDate evaluation. Fine for the current rate
(once per sync invocation), but `_sync` recurses for each column, so it fires
repeatedly during column expansion. Could be inlined / pooled if it shows up
in profiles.

### 11. `mergeHorizontal` allocates inside the nested loop
[merge.ts:96-119](../../api/sync/merge.ts#L96-L119)

Adds two `resolveRange` calls per inner iteration, plus the existing
`new Set([...])` for memberOf/language union, plus `mergeRanges`. With many
columns this is a hot path during the post-sync merge phase. Pre-existing
structure, mildly amplified.

### 13. `initSync` rewrites the whole syncList on every cold start with legacy entries
[sync.ts:79-86](../../api/sync/sync.ts#L79-L86)

One-time per upgrade per device. Listed for completeness.

---

## Verified non-issues

Listed so future audits don't re-investigate:

- **Remote fetch can no longer hang in a permanent loading state** *(was open item #12)* —
  resolved by the `isFetching`/`error` rework in `HybridQuery`. `_postAndMerge` settles the
  remote leg in a `finally` (`_settleRemote`) whether the POST resolves, fails, or bails on a
  stale generation, so a flaky network no longer leaves loading stuck on; a total remote failure
  surfaces via the `error` ref. Offline POSTs are parked on the reconnect watcher and settle
  immediately ([HybridQuery.ts](./HybridQuery.ts) `_runApiWhenOnline` / `_postAndMerge`). There
  is still no explicit timeout or automatic retry beyond the offline→reconnect re-fire — listed
  here so it isn't re-flagged as a hang.
- **Wire format unchanged for default callers** — confirmed at
  [syncBatch.ts:73-83](../../api/sync/syncBatch.ts#L73-L83). No extra bytes
  on the request for users without a publishDate cutoff. Good for metered
  connections.
- **No new full-table Dexie scans** — local path goes through existing
  `mangoToDexie` which uses the same indexed pushdown.
- **No new background timers or polling loops**.
- **`luminary.ts` adds one function call at startup** — no startup cost beyond
  `initSync` itself.
- **`onScopeDispose` cleanup is in place** — socket listener and Dexie watcher
  are torn down on component unmount.
- **Bundle size**: ~700 LOC of new shared code → estimated +8–12 KB gzipped to
  the shared bundle. Reasonable.
- **API validator is minimal** — adds negligible request-time CPU on the
  server.
