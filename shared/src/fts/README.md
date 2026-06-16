# Full-Text Search (FTS) Module

## Overview

This module provides offline full-text fuzzy search on IndexedDB data using **trigram indexing** with **BM25 scoring**. FTS data is computed server-side (API) and stored directly on Content documents as a string array, and indexed using a Dexie MultiEntry index.

### Why Trigram Indexing?

Standard FTS libraries like Fuse.js or Lunr.js load the entire search index into RAM. On a budget phone with 1-2GB of RAM, this causes the app to freeze or crash. Trigram indexing stores the search index in IndexedDB (on disk), using only a few kilobytes of RAM per search query.

### How Trigrams Work

Every word is split into 3-character overlapping chunks:

```
"Search" -> ["sea", "ear", "arc", "rch"]
"Serch"  -> ["ser", "erc", "rch"]
```

Even with a typo ("Serch"), the trigram "rch" still matches, providing fuzzy search capability.

## Usage

### Vue Composable (Recommended)

```typescript
import { ref } from "vue";
import { useFtsSearch } from "luminary-shared";

const query = ref("");
const languageId = ref("lang-en");

const { results, isSearching, loadMore, hasMore } = useFtsSearch(query, {
    languageId,
    debounceMs: 300,
    pageSize: 20,
});
```

### Direct Function

```typescript
import { ftsSearch } from "luminary-shared";

const results = await ftsSearch({
    query: "search terms",
    languageId: "lang-en",
    limit: 20,
    offset: 0,
    maxTrigramDocPercent: 50,
});
```

### FtsSearchResult

| Property         | Type                  | Description                                                                              |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `docId`          | `string`              | The document ID                                                                         |
| `score`          | `number`              | BM25 score plus word match bonus                                                        |
| `wordMatchScore` | `number`              | Boost-weighted count of full query words matched                                        |
| `doc`            | `ContentDto`          | The matched document. From local search: the full doc. From server search: trimmed of `fts`/`ftsTokenCount` (display-only — see Routing) |
| `source`         | `"local" \| "api"`    | Which engine produced the result (set by the router)                                    |

The `useFtsSearch` composable additionally exposes `source: Ref<"local" \| "api">` and `isPartial: Ref<boolean>` (see Routing).

## Routing: local vs server-side search

The library can search the **local** IndexedDB index or a **server-side** `/fts` endpoint that searches the full corpus the user is permitted to see (useful when only a subset of content is synced to the device). `useFtsSearch` routes each search automatically; `ftsSearch` / `ftsSearchApi` can be called directly.

`shouldUseApiFts()` decides the route:

- **Offline** (`isConnected === false`) → local.
- **Full sync** (no `publishDate` cutoff) and not CMS → local (everything is on the device).
- **Online and (a cutoff is set, or `SharedConfig.cms`)** → server `/fts`.

Properties of the routing:

- **Single source per search (no merge).** The server corpus is a superset of the synced subset, so its result is already complete; merging local results would only duplicate and skew ranking. The route is fixed at search start and reused by `loadMore`.
- **Graceful degradation.** If the server call fails, the search falls back to local results. `isPartial` is `true` whenever results are local while a cutoff is in effect (offline, or fallback) — i.e. an incomplete recent-only view the UI can flag. When connectivity returns, a partial search re-runs against the server.
- **Server results are display-only.** They are trimmed of `fts`/`ftsTokenCount` and **must not be persisted to IndexedDB** — doing so would leave them un-indexed by `*fts` (breaking offline search for those IDs) and skew `corpusStats`. They are for in-memory rendering only.

See ADR 0011 for the rationale and ADR 0010 for the server endpoint.

## Architecture

### FTS Data Storage

FTS data lives directly on Content documents as a `string[]` field called `fts`, with each entry in `"token:tf"` format (e.g. `"qua:3"`, `"uan:1.5"`). A Dexie MultiEntry index (`*fts`) indexes each array element individually, enabling efficient trigram lookups.

- **`docs` table**: Content documents carry `fts` (trigram strings) and `ftsTokenCount` (raw token count for BM25)
- **`luminaryInternals` table**: Stores corpus stats under key `"corpusStats"` for BM25 scoring

### Server-Side Indexing

The API computes FTS data in `processContentDto`:

1. For each configured field (title, summary, text, author), generate trigrams
2. Apply field boost multipliers to term frequencies (title=3.0, summary=1.5, text=1.0, author=1.0)
3. Aggregate into a flat `string[]` of `"token:tf"` entries
4. Store as `fts` and `ftsTokenCount` on the ContentDto

### Client-Side Search

Search uses the MultiEntry index via `between()` queries:

```typescript
db.docs.where("fts").between(trigram + ":", trigram + ";", true, false);
```

This finds all documents containing a given trigram. The TF value is parsed from the matched strings for BM25 scoring.

### BM25 Scoring

Each search query:

1. Generates search trigrams from the query
2. Counts docs per trigram (in parallel) and filters out over-represented trigrams (appearing in >`maxTrigramDocPercent`% of docs, default 50%)
3. **High-df pruning**: keeps only the most discriminative (lowest-df) trigrams within a df budget — common trigrams add many matches but little ranking signal
4. Computes IDF for each kept trigram
5. Collects matching doc IDs (in parallel) across the kept trigrams
6. **Language pre-filter**: when a `languageId` is given, restricts the matched IDs to that language *before* loading (an index-only ID scan), so docs in other languages aren't read
7. Loads the matched docs and parses TF from their `fts` arrays
8. Computes BM25 score using TF, IDF, and document length normalization
9. Adds the word-match bonus for full query words in high-boost fields — only for the **top-K by BM25** (`max(offset+limit, WORDMATCH_TOPK)`), to bound the HTML-stripping cost; docs below keep their BM25-only score
10. Sorts by combined score and paginates

> Performance note: the local engine loads full docs to read `tf` for ranking, so doc loading + scoring dominate on large (full-sync) corpora. Also note IndexedDB serializes reads on a single object store, so the parallel scans above help less than the term-pruning. A future rewrite ranks from the `*fts` index directly (via Dexie `eachKey`) and loads only the top-K — see ADR 0011.

### Corpus Stats

Corpus statistics (total token count, document count) are maintained for BM25's average document length calculation:

- Recomputed after each `bulkPut` containing ContentDtos
- Debounced recompute (10s) after document deletions
- Recomputed on startup

### Deletion Handling

Deleting a document automatically removes its MultiEntry index entries. The deletion paths schedule a debounced corpus stats recomputation:

1. **`bulkPut()`** — Delete commands from the API
2. **`deleteRevoked()`** — Access map changes (permission revocation)
3. **`deleteExpired()`** — Expired content removal on startup
4. **`purge()`** — Full database wipe

## Multilingual Filtering Strategy

This module does **not** use a stop-word list, because the app is multilingual.

Instead, a two-tier filtering approach is used:

1. **Index time**: Words of 2 characters or less are skipped
2. **Search time**: Trigrams appearing in more than `maxTrigramDocPercent`% of documents (default: 50%) are skipped

## FTS Field Config

Hard-coded identically in `api/src/util/ftsIndexing.ts` and `shared/src/fts/ftsSearch.ts`:

```typescript
{ name: "title", boost: 3.0 },
{ name: "summary", boost: 1.5 },
{ name: "text", isHtml: true, boost: 1.0 },
{ name: "author", boost: 1.0 },
```

## Low-End Device Design Decisions

- **Unique trigrams only per document**: Reduces index size significantly
- **Text truncation at 5000 chars**: Caps trigram generation on long documents
- **Search-time frequency filtering**: Skips common trigrams to keep search fast
- **MultiEntry index**: Leverages IndexedDB's native B-tree for trigram lookups without separate index tables
