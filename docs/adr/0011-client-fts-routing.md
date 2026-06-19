# 11. Client-side FTS routing (local vs server)

Date: 2026-06-16

## Status

Accepted

## Context

There are now two full-text search engines: offline/local search over IndexedDB (ADR 0009) and the server-side `POST /fts` endpoint over the full corpus (ADR 0010). With selective sync (a `publishDate` cutoff), the device holds only a recent subset, so local search silently misses permitted content that isn't synced. The client needs to decide, per search, which engine to use, and present the result coherently.

## Decision

A routing layer in `luminary-shared` (`shared/src/fts/ftsSearchApi.ts` + the existing `useFtsSearch` composable) chooses the engine per search, keyed on whether the local index can be missing permitted docs — i.e. whether a `publishDate` sync cutoff is in effect:

- **Offline** (`isConnected === false`) → **local**.
- **No `publishDate` cutoff** (full content sync — every permitted doc is on the device) → **local**.
- **Online and a `publishDate` cutoff is set** (selective sync) → **server `/fts`**.

`shouldUseApiFts()` encodes this as `isConnected.value && getContentPublishDateCutoff() !== OPEN_MIN`.

### Amendment (2026-06-19): no CMS-forced API path

The original decision routed the CMS to the server `/fts` whenever online (even with no cutoff), on the rationale that the CMS wanted authoritative, server-computed full-corpus rankings. This is superseded: the CMS now searches its **local** index when online, because it has no cutoff and therefore already holds every permitted doc for the selected languages — making local authoritative. This makes search **consistent with the CMS's browse path**, which uses `HybridQuery` and likewise never calls the API with no cutoff (`decideContentApiQuery` returns `undefined`); it was incoherent for the same client to trust local for browse but not for search.

Consequences of the amendment:

- The CMS no longer issues a `/fts` request per search; both browse and search are local-first. Drafts/expired remain searchable because local search has no visibility filter (the CMS applies a `status` filter itself; see `useContentSearchQuery`).
- Trade-off: a search run while the CMS is still backfilling sync (or just after switching language/group) can momentarily miss not-yet-synced docs, and BM25 corpus stats can lag a batch. This is the same "local is authoritative when fully synced" assumption already made by `HybridQuery` browse, accepted here for routing symmetry. `isPartial` stays `false` for the CMS (no cutoff), so there is no reconnect re-run.
- `config.cms` no longer participates in `shouldUseApiFts`. Because the CMS (no cutoff) never routes to `/fts` now, the server's CMS path is no longer exercised through `useFtsSearch`; `ftsSearchApi` still forwards `cms: config.cms` (and the `status` filter it unlocks) so a direct `/fts` caller — or a future routing change — keeps that capability.

### Single-source, no merge

When routing to the server, local results are **not** merged in. The `/fts` corpus is a *superset* of the locally-synced subset, so its result is already complete; merging local would only add duplicates and BM25 ranking inconsistency (server uses full-corpus document frequency, local uses the synced subset). A given search therefore comes entirely from one engine. The route is fixed at the start of a search and reused by `loadMore`, so paging never splits a result list across engines.

### Graceful degradation

- **API failure** (HTTP error or a network drop) → fall back to **local** results for that search.
- **Partial indicator.** Whenever results come from local search while a cutoff is in effect (offline, or API-failure fallback), they are an incomplete recent-only view; `useFtsSearch` exposes `isPartial` so the UI can say so. `source` ("local" | "api") is also exposed.
- **Reconnect upgrade.** If a search ran/fell back to local while offline, it re-runs against the server when connectivity returns, replacing the partial result.

### Server results are display-only

`/fts` returns docs trimmed of `fts`/`ftsTokenCount` (ADR 0010). These live only in memory and **must never be written to Dexie** — persisting them would leave them un-indexed by the `*fts` MultiEntry index (breaking offline search for those IDs) and skew the local `corpusStats`.

### Local-engine performance

Profiling the local engine on a full-sync corpus drove several optimizations in `shared/src/fts/ftsSearch.ts` (~1.45s → ~700ms):

- **Language pre-filter before load** (biggest, no recall change): intersect matched IDs with `where("language").equals(languageId).primaryKeys()` (an index-only ID scan) before loading docs, so we don't read+deserialize the large `fts` array of docs the language filter would discard.
- **Top-K word-match**: the HTML-stripping word-match bonus runs only on the top `max(offset+limit, WORDMATCH_TOPK)` by BM25; docs below keep their BM25-only score.
- **High-df pruning** (mirrors the server): keep the most discriminative trigrams within a df budget. Note this helped less locally than on the server — the load is already bounded by the language filter, so pruning mostly trims the cheap union scan, not the doc load.
- **Parallelized index scans** via `Promise.all`. Note: IndexedDB serializes reads on one object store, so this gave little for the `.count()` pass; document it so it isn't relied upon.

The remaining local bottleneck is structural: the engine loads full docs (with their large `fts` arrays) just to read `tf` for ranking. Ranking from the `*fts` index instead (via Dexie `eachKey`) and loading only the top-K is tracked as a follow-up (mirroring the server's two-phase design).

## Consequences

- Online partial-sync users get full-corpus results; offline/full-sync users get instant local results; the transition is graceful with a clear partial indicator.
- No local+server result-merge logic to maintain or get subtly wrong.
- The BM25 params and word-match logic remain mirrored across `api/src/util/ftsScoring.ts`, `api/src/util/ftsIndexing.ts`, and `shared/src/fts/ftsSearch.ts` (ADR 0009/0010); routing does not add a fourth copy.
- `useFtsSearch`'s return type gains `source` and `isPartial`; consumers may render the partial state but are not required to.
