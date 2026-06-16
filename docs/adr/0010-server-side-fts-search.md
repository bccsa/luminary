# 10. Server-side FTS search

Date: 2026-06-16

## Status

Accepted

## Context

FTS indexing was moved to the API (ADR 0009), but **search still runs entirely on the client** against IndexedDB (`shared/src/fts/ftsSearch.ts`). Because the query executes against locally-stored documents, only content that has been synced to the device is searchable. With selective/partial sync (group/language scoping, retention cut-offs, below-cutoff eviction), a user can no longer find content they are permitted to see but that isn't on their device.

We need a server-side FTS endpoint that searches the full corpus, returns results ranked consistently with local search, and never leaks content the user can't access — used as an online complement to local search.

The FTS data already on every `ContentDto` (`fts: string[]` of `"trigram:tf"` entries, plus `ftsTokenCount`) is shaped for IndexedDB multi-entry ingestion, not for server-side lookup. CouchDB Mango `_find` cannot efficiently do the Dexie-style prefix range over array entries.

## Decision

Add a `POST /fts` endpoint (`FtsSearchController` + `FtsSearchService`) that reproduces the trigram + BM25 ranking server-side.

### Trigram-split CouchDB views

A traditional CouchDB **view** (`fts-trigram-index`) whose JavaScript map splits each `"trigram:tf"` entry and **emits one row per trigram**, giving a B-tree keyed by trigram. A second view (`fts-corpus-stats`) provides corpus statistics via a `_stats` reduce (`docCount`, `totalTokenCount` → average document length). Views build lazily from the existing `fts` data, so **no schema upgrade / backfill is required**.

### Filter metadata embedded in the view value

The trigram view value is a tuple `[tf, parentType, status, publishDate, expiryDate, language, memberOf, parentTags]`. This lets the service apply permission and visibility filtering — and optional CMS filters (tags, status, publishDate range) — **in JS directly from the index rows**, with no per-query Mango `_find`. Consequences:

- **Filtering happens before the top-K cap.** Candidates are pre-ranked by `Σ idf·tf` and capped (top-K = 500) only after permission/visibility/optional filters, so a narrow-access user's results are never truncated by higher-scoring documents they can't see.
- **IDF uses the accessible document frequency** (distinct surviving docIds), not the global corpus — arguably more correct than the client's synced-subset df, but a documented source of minor ranking divergence.
- **Index value bloat:** embedding doc metadata per trigram row makes the view ~10–15× larger by value size (row count unchanged) than a bare `tf`. This is the deliberate cost of avoiding a per-query Mango `_find`, getting a correct accessible-set top-K, and serving CMS filters from the index.

### Permission enforcement

Permissions are enforced from the embedded `memberOf` against the user's View groups (via `PermissionSystem.accessMapToGroups`), and only IDs of documents that pass are ever returned — nothing leaks. On the non-CMS path the service also requires `status === published`, `publishDate <= now` (excludes scheduled), `expiryDate > now` (excludes expired), and an accessible language. The `cms` flag skips those visibility filters (View permission still required) and enables draft/`status` filtering.

### BM25 and word-match parity (keep in sync with the client)

Scoring is reimplemented in `api/src/util/ftsScoring.ts`, reusing the API-side `FTS_FIELDS` from `ftsIndexing.ts`. The BM25 parameters (`k1 = 1.2`, `b = 0.75`), the over-common-trigram threshold (50%), and the boost-weighted full-word **word-match bonus** mirror `shared/src/fts/ftsSearch.ts`. The word-match bonus needs the original field text (it cannot be derived from the lossy trigram data), which is why the service fetches the top-K documents (a by-key `_all_docs` fetch, not Mango) before the final scoring pass. **If you change BM25 params or field boosts on one side, change the other**, or server and client relevance silently diverge — the same forcing function as ADR 0009.

Word-match (and therefore final ranking and pagination) is computed server-side rather than pushed to the client: it does not save the doc fetch (bodies are needed for display either way), and a client-side approach would force a larger BM25-ranked top-N response with client-side pagination, penalizing the mobile/partial-sync clients this targets.

### Response: ranked page bodies, not persistable

The endpoint returns `[{ docId, score, wordMatchScore, doc }]` for the requested page only. Because the top-K docs are already loaded server-side for word-match scoring, returning the page's bodies is nearly free and removes a client round-trip to render online-only results.

**The returned `doc` is trimmed of the FTS index fields (`fts`, `ftsTokenCount`) and MUST NOT be persisted on the client.** Writing these into the client's Dexie `docs` table would leave them un-indexed by the `*fts` MultiEntry index (breaking offline search for those IDs) and would skew the locally-cached `corpusStats`. The response is for in-memory rendering and merging with local results — never for caching as canonical docs.

## Consequences

- Online users can search the full corpus they are permitted to see, complementing offline search for partially-synced devices.
- No schema upgrade is needed; the two views index lazily from existing data (the first query incurs a one-time build).
- BM25 params + `FTS_FIELDS` are now mirrored in three places (`api/src/util/ftsIndexing.ts`, `api/src/util/ftsScoring.ts`, `shared/src/fts/ftsSearch.ts`). The API cannot import from `luminary-shared`, so this remains a documented mirror (extends ADR 0009).
- Corpus stats served here cover the full server corpus (including drafts) vs. the client's synced-subset stats — minor BM25 differences, acceptable. Serving API corpus stats to clients for unified scoring is a possible future step.
- The trigram view is large (embedded per-trigram metadata); this is an accepted storage cost for query performance and correctness.
- The client-side merge/de-duplication of server + local results, and the rule that server results are not persisted, are handled in a separate client-implementation change.
