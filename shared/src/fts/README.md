# Full-Text Search (FTS) Module

## Overview

This module provides offline full-text fuzzy search on IndexedDB data using **trigram indexing** with **BM25 scoring**. FTS data is computed server-side (API) and stored directly on Content documents using a Dexie MultiEntry index.

### Why Trigram Indexing?

Standard FTS libraries like Fuse.js or Lunr.js load the entire search index into RAM. On a budget phone with 1-2GB of RAM, this causes the app to freeze or crash. Trigram indexing stores the search index in IndexedDB (on disk), using only a few kilobytes of RAM per search query.

### How Trigrams Work

Every word is split into 3-character overlapping chunks:

```
"Search" -> ["sea", "ear", "arc", "rch"]
"Serch"  -> ["ser", "erc", "rch"]
```

Even with a typo ("Serch"), the trigram "rch" still matches, providing fuzzy search capability.

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
db.docs.where("fts").between(trigram + ":", trigram + ";", true, false)
```

This finds all documents containing a given trigram. The TF value is parsed from the matched strings for BM25 scoring.

### BM25 Scoring

Each search query:
1. Generates search trigrams from the query
2. Filters out over-represented trigrams (appearing in >50% of docs)
3. Computes IDF for each usable trigram
4. Loads matching documents and parses TF from their `fts` arrays
5. Computes BM25 score using TF, IDF, and document length normalization
6. Adds word match bonus for full query words found in high-boost fields
7. Sorts by combined score

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

| Property | Type | Description |
|----------|------|-------------|
| `docId` | `string` | The document ID |
| `score` | `number` | BM25 score plus word match bonus |
| `wordMatchScore` | `number` | Boost-weighted count of full query words matched |

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
