# Full-Text Search (FTS) Module

## Overview

This module provides offline full-text fuzzy search on IndexedDB data using **trigram indexing**. It is designed to work effectively on low-end Android devices ($100-$200) with limited memory and CPU capacity.

### Why Trigram Indexing?

Standard FTS libraries like Fuse.js or Lunr.js load the entire search index into RAM. On a budget phone with 1-2GB of RAM (much of it consumed by the OS and browser), this approach will cause the app to freeze or crash.

Trigram indexing stores the search index in IndexedDB (on disk), using only a few kilobytes of RAM per search query. The trade-off is slightly lower search precision compared to in-memory libraries, but the app remains usable on any device.

| Approach | Storage | RAM Usage | Fuzziness | Low-end Device |
|----------|---------|-----------|-----------|----------------|
| Trigram (this module) | Disk (IndexedDB) | Very Low | Good | Works well |
| Fuse.js / Lunr | In-Memory | High | Excellent | Crashes / freezes |
| FlexSearch + IDB | Hybrid | Medium | Excellent | May struggle |

### How Trigrams Work

Every word is split into 3-character overlapping chunks:

```
"Search" -> ["sea", "ear", "arc", "rch"]
"Serch"  -> ["ser", "erc", "rch"]
```

Even with a typo ("Serch"), the trigram "rch" still matches, providing fuzzy search capability.

## Architecture

### Database Tables

Three IndexedDB tables (via Dexie) store the search index:

- **`ftsIndex`**: Forward index with compound index `[token+negPublishDate]`. Each entry maps a trigram to a document. The `negPublishDate` field (`0 - publishDate`) enables newest-first ordering through ascending index scan.
- **`ftsReverse`**: Maps `docId` -> `tokens[]` for efficient deletion of all index entries when a document is removed.
- **`ftsMeta`**: Stores the indexer checkpoint and field configuration.

### Background Indexing

Indexing runs in the background using `requestIdleCallback` / `setTimeout`, throttled to avoid blocking the UI thread:

1. The indexer reads documents from the `docs` table in `updatedTimeUtc` order
2. For each document, it extracts text from configured fields, generates trigrams, and writes index entries
3. A **checkpoint** (the highest `updatedTimeUtc` processed) is persisted in `ftsMeta`
4. If the app closes mid-indexing, it resumes from the checkpoint on next startup
5. Between batches, a configurable delay (default: 100ms) yields to other tasks

### Negative Timestamp Trick

IndexedDB indexes are sorted ascending. To get newest-first results without in-memory sorting (which would spike CPU on low-end devices), we store `negPublishDate = 0 - publishDate`. In ascending order, more negative values (newer dates) come first.

### Deletion Handling

Four deletion paths in the codebase trigger FTS cleanup:

1. **`bulkPut()`** - Delete commands from the API
2. **`deleteRevoked()`** - Access map changes (permission revocation)
3. **`deleteExpired()`** - Expired content removal on startup
4. **`purge()`** - Full database wipe

Each path calls `ftsNotifyDeleted(docIds)` which queues the document IDs for FTS index cleanup.

## Configuration

FTS is configured via `SharedConfig` when initializing the shared library:

```typescript
import { init } from "luminary-shared";

await init({
    // ... other config ...
    ftsFields: [
        { name: "title" },
        { name: "summary" },
        { name: "text", isHtml: true },  // HTML will be stripped before indexing
        { name: "author" },
    ],
    ftsMaxTrigramDocCount: 500,  // Optional, default: 500
});
```

### FtsFieldConfig

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Field name on the document (e.g. "title", "text") |
| `isHtml` | `boolean?` | If true, HTML tags are stripped before indexing |

### Changing Field Configuration

If you change `ftsFields` (add/remove/modify fields), the module detects the change on startup, **wipes the entire FTS index**, and re-indexes all documents from scratch. This ensures consistency.

### FTS Init Options

| Option | Default | Description |
|--------|---------|-------------|
| `ftsFields` | *required* | Which document fields to index |
| `ftsMaxTrigramDocCount` | 500 | Trigrams appearing in more than this many documents are skipped at search time |

### Indexer Tuning (via `initFts()`)

| Option | Default | Description |
|--------|---------|-------------|
| `batchSize` | 10 | Documents indexed per batch |
| `throttleMs` | 100 | Delay between batches (ms) |

## Multilingual Filtering Strategy

This module does **not** use a stop-word list, because the app is multilingual and a hardcoded list would only cover one language.

Instead, a two-tier filtering approach is used:

1. **Index time**: Words of 2 characters or less are skipped. These are almost universally articles/prepositions across all languages ("a", "de", "le", "el", "en", "zu", etc.) and would produce 0 trigrams anyway.

2. **Search time**: Before querying, each search trigram's document count is checked against the total number of indexed documents. Trigrams appearing in more than `maxTrigramDocPercent`% of documents (default: 50%) are skipped. This scales with dataset size and filters out over-represented trigrams like "the", "ing", "tion" without needing a language-specific list.

## Usage

### Vue Composable (Recommended)

```typescript
import { ref } from "vue";
import { useFtsSearch } from "luminary-shared";

const query = ref("");
const languageId = ref("lang-en");

const { results, isSearching, loadMore, hasMore } = useFtsSearch(query, {
    languageId,
    debounceMs: 300,   // Default: 300
    pageSize: 20,       // Default: 20
});

// results.value is FtsSearchResult[]
// Call loadMore() for infinite scroll
```

### Direct Function

```typescript
import { ftsSearch } from "luminary-shared";

const results = await ftsSearch({
    query: "search terms",
    languageId: "lang-en",  // Optional
    limit: 20,               // Default: 20
    offset: 0,               // For pagination
    maxTrigramDocPercent: 50,  // Default: 50 (skip trigrams in >50% of docs)
});
```

### FtsSearchResult

| Property | Type | Description |
|----------|------|-------------|
| `docId` | `string` | The document ID |
| `parentId` | `string` | Parent post/tag ID |
| `negPublishDate` | `number` | Negative publish date (for sorting) |
| `score` | `number` | Number of matching trigrams (higher = better match) |

## Low-End Device Design Decisions

Every design choice in this module prioritizes minimal resource usage:

- **Batch size of 10**: Small enough to avoid garbage collection pauses on devices with limited memory
- **100ms throttle between batches**: Gives the main thread breathing room for UI rendering
- **Unique trigrams only per document**: A 2000-word article might produce ~10,000 trigram instances but only ~2,000 unique trigrams. Storing only unique trigrams reduces index size by ~80%
- **Compound index `[token+negPublishDate]`**: Sorting happens at the C++ level of the browser's database engine, not in JavaScript. No `.sort()` call needed
- **requestIdleCallback**: Indexing only runs when the browser is idle, preventing jank
- **Checkpoint persistence**: If the user closes the app after indexing 500 of 2000 documents, reopening resumes from document 501
- **Text truncation at 5000 chars**: Most relevant search terms appear early in content. Capping prevents excessive trigram generation on very long documents
- **Search-time frequency filtering**: Avoids scanning massive result sets for common trigrams, keeping search fast even on slow devices

## Index Size Estimation

For 1000 documents averaging 200 unique trigrams each:
- `ftsIndex` table: ~200,000 entries x ~100 bytes = ~20MB
- `ftsReverse` table: ~1,000 entries x ~1KB = ~1MB
- Total: ~21MB in IndexedDB

This is well within the storage capabilities of low-end devices.
