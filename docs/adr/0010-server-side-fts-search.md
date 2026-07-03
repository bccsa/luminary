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

- **Filtering happens before the top-K cap.** Candidates are pre-ranked by `Σ idf·tf` and capped (top-K = `max(150, offset + limit)`) only after permission/visibility/optional filters, so a narrow-access user's results are never truncated by higher-scoring documents they can't see.
- **IDF uses the accessible document frequency** (distinct surviving docIds), not the global corpus — arguably more correct than the client's synced-subset df, but a documented source of minor ranking divergence.
- **Index value bloat:** embedding doc metadata per trigram row makes the view ~10–15× larger by value size (row count unchanged) than a bare `tf`. This is the deliberate cost of avoiding a per-query Mango `_find`, getting a correct accessible-set top-K, and serving CMS filters from the index.

### Permission enforcement

Permissions are enforced from the embedded `memberOf` against the user's View groups (via `PermissionSystem.accessMapToGroups`), and only IDs of documents that pass are ever returned — nothing leaks. On the non-CMS path the service also requires `status === published`, `publishDate <= now` (excludes scheduled), `expiryDate > now` (excludes expired), and an accessible language. The `cms` flag skips those visibility filters (View permission still required) and enables draft/`status` filtering.

### BM25 and word-match parity (keep in sync with the client)

Scoring is reimplemented in `api/src/util/ftsScoring.ts`, reusing the API-side `FTS_FIELDS` from `ftsIndexing.ts`. The BM25 parameters (`k1 = 1.2`, `b = 0.75`), the over-common-trigram threshold (50%), and the boost-weighted full-word **word-match bonus** mirror `shared/src/fts/ftsSearch.ts`. The word-match bonus needs the original field text (it cannot be derived from the lossy trigram data), which is why the service fetches the top-K documents (a by-key `_all_docs` fetch, not Mango) before the final scoring pass. **If you change BM25 params or field boosts on one side, change the other**, or server and client relevance silently diverge — the same forcing function as ADR 0009.

Word-match (and therefore final ranking and pagination) is computed server-side rather than pushed to the client: it does not save the doc fetch (bodies are needed for display either way), and a client-side approach would force a larger BM25-ranked top-N response with client-side pagination, penalizing the mobile/partial-sync clients this targets.

### Performance

The query path is several CouchDB reads plus an in-JS filter over the candidate rows. The following tuning brought a representative query from ~600–800ms to ~200ms (warm), and matters because the candidate scan and doc fetch dominate:

- **Connection reuse.** The `nano` HTTP agent uses `keepAlive: true` so the multiple sequential CouchDB round trips in one query don't each pay TCP connection setup.
- **Parallel + cached reads.** The independent corpus-stats and document-frequency reads run concurrently (`Promise.all`); corpus stats are cached in `DbService` for 60s (they change slowly), removing a round trip from most queries.
- **Stale view reads.** The FTS view reads use `{ stable: true, update: "lazy" }` — return immediately from the current index instead of blocking the read to update it, then update in the background. FTS tolerates slight staleness, and `lazy` keeps the index converging even if the background indexer is off.
- **High-df trigram pruning.** After the over-common-trigram filter, only the most discriminative (lowest-df) trigrams are kept, within a candidate-row budget (`Σ df ≤ FTS_CANDIDATE_ROW_BUDGET`, floor `FTS_MIN_TRIGRAMS`). A trigram's df ≈ the candidate rows it contributes; common trigrams add many rows but little ranking signal (low IDF), so dropping them ~halved the candidate scan with negligible change to surviving documents.
- **Dynamic top-K.** The exact-scored set is `max(FTS_TOP_K_MIN=150, offset + limit)` rather than a fixed 500 — each fetched doc drags its large `fts` array, so a smaller K means a much smaller doc fetch while the `Σ idf·tf` pre-rank keeps page ordering stable.
- **Doc fetch uses `_all_docs` by keys, NOT Mango `_find`.** A Mango `selector: { _id: { $in } }` range-scans the primary index between the min/max id in the set — with random UUIDs that scans most of the database (~6× slower, scaling with corpus size, not the K ids). `_all_docs` with `keys` does direct point lookups. The `fts` array is stripped from the response regardless, so the client payload is lean either way; a leaner *internal* fetch would require a docid-keyed projection **view** (Mango is not an option), which was judged not worth a second view to maintain.

### Response: ranked page bodies, not persistable

The endpoint returns `[{ docId, score, wordMatchScore, doc }]` for the requested page only. Because the top-K docs are already loaded server-side for word-match scoring, returning the page's bodies is nearly free and removes a client round-trip to render online-only results.

**The returned `doc` is trimmed of the FTS index fields (`fts`, `ftsTokenCount`) and MUST NOT be persisted on the client.** Writing these into the client's Dexie `docs` table would leave them un-indexed by the `*fts` MultiEntry index (breaking offline search for those IDs) and would skew the locally-cached `corpusStats`. The response is for in-memory rendering and merging with local results — never for caching as canonical docs.

## Consequences

- Online users can search the full corpus they are permitted to see, complementing offline search for partially-synced devices.
- No schema upgrade is needed; the two views index lazily from existing data (the first query incurs a one-time build).
- BM25 params + `FTS_FIELDS` are now mirrored in three places (`api/src/util/ftsIndexing.ts`, `api/src/util/ftsScoring.ts`, `shared/src/fts/ftsSearch.ts`). The API cannot import from `luminary-shared`, so this remains a documented mirror (extends ADR 0009).
- Corpus stats served here cover the full server corpus (including drafts) vs. the client's synced-subset stats — minor BM25 differences, acceptable. Serving API corpus stats to clients for unified scoring is a possible future step.
- The trigram view is large (embedded per-trigram metadata); this is an accepted storage cost for query performance and correctness.
- The client-side routing between this endpoint and local search — and the rule that server results are not persisted — landed as a separate change; see ADR 0011. That change chose **single-source routing (no local+server merge)**: because this endpoint's corpus is a superset of the locally-synced subset, its result is already complete, so merging local results would only add duplicates and df-scope ranking inconsistency.

## Amendment (2026-06-22): strict search for non-Content doctypes (User, Redirect)

The strict path (substring-AND on small fields + field sort, no BM25) generalises to admin doctypes that need a "find by (part of a) name" lookup rather than relevance. The same `/fts` endpoint now also serves **User** (name + email) and **Redirect** (slug + toSlug) so their CMS overviews can search/sort/paginate server-side instead of pulling every doc and filtering in memory.

Design (`AUX_FTS_CONFIG` + `searchAux` in `ftsSearch.service.ts`):

- **One endpoint, parameterised by doctype.** A request whose `types` is a single aux doctype routes to `searchAux`; the Content path is untouched. No new endpoints.
- **One trigram view per doctype** (`fts-trigram-index-user`, `fts-trigram-index-redirect`), each emitting a **named metadata object** (`{ memberOf, …searchable fields, …sort fields }`) instead of the Content view's positional tuple — self-describing and less brittle as fields are added.
- **Strict-only ⇒ no BM25, no corpus stats.** The `fts` trigrams only generate candidates; the substring-AND check on the emitted field text is the precise filter. Over-common-trigram pruning is skipped (these corpora are small); the rarest-trigram candidate-row budget still applies. Sort reuses the Content strict comparator (nulls last, case-insensitive, `_id` tie-break).
- **Permission** reuses the `memberOf ∩ View-groups` scoping; an optional explicit `groups` filter narrows further (post-permission, never widens).
- **Indexing.** `fts` is computed at write time in `processUserDto`/`processRedirectDto` from strict-only field configs (`USER_FTS_FIELDS`/`REDIRECT_FTS_FIELDS`); no `ftsTokenCount`. Existing docs are backfilled by schema upgrade **v18**; the two views build lazily on first access after deploy (`npm run seed` pushes the design docs).
- **Server-only, no offline.** These doctypes' `fts` is **not** used by the client offline engine; it is stripped from non-Content docs on `db.bulkPut` so it can't pollute the local `*fts` index. Consumers search via the server-only `useServerFtsSearch` composable; offline yields an empty result set.

This keeps the "change one, change all" mirror rule (ADR 0009) scoped to the **Content** field/BM25 config — the aux field configs are strict-only with no client counterpart.
