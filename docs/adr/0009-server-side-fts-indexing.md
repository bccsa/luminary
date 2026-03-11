# 9. Server-side FTS indexing

Date: 2026-03-09

## Status

Accepted

## Context

Full-text search (FTS) indexing previously ran entirely on the client. When Content documents were synced to the app, a background worker computed trigrams from the raw document text and stored them in the local `ftsIndex` IndexedDB table. This had several downsides:

- **CPU cost on clients**: Trigram computation is CPU-intensive and delayed search availability, especially on low-end mobile devices.
- **Duplicated work**: Every client independently computed the same trigrams for the same documents.
- **Complexity**: The client needed a checkpoint-based batch indexing system with throttling (`ftsWorkerBridge`) to avoid blocking the UI.

## Decision

Move FTS indexing to the API. Pre-calculated trigram data is now computed when Content documents are submitted via the change request pipeline (`processContentDto`), stored as two fields on the ContentDto (`fts` and `ftsTokenCount`), and delivered to clients during sync.

The client extracts the `fts` entries into its local `ftsIndex` IndexedDB table on receipt (in `bulkPut`), strips the `fts` array from the document before storage, and keeps `ftsTokenCount` on the document for BM25 doc length normalization. Search remains fully client-side, querying the local `ftsIndex` table.

### Hard-coded field configuration

The FTS field configuration (which document fields to index, their boost values, and whether to strip HTML) is hard-coded in two locations:

- **API (index time)**: `api/src/util/ftsIndexing.ts`
- **Shared library (search time)**: `shared/src/fts/ftsSearch.ts`

This was chosen over a dynamic/configurable approach because:

1. **Tightly coupled to schema**: The indexed fields (`title`, `summary`, `text`, `author`) are Content document fields. They only change when the ContentDto schema changes, which is rare and requires code changes anyway.
2. **Simplicity**: A shared config mechanism (API endpoint, shared constants, database-stored config) adds complexity — import paths, build dependencies, sync timing — for a value that almost never changes.
3. **Re-index required regardless**: Any change to field config (new fields, different boost values) requires a CouchDB migration to recompute FTS data for all existing documents. The migration script is the forcing function, not the config storage mechanism.

**If you change the field config in one location, you must change it in the other.** Both files have prominent comments noting this requirement.

## Consequences

- Clients no longer need CPU for FTS indexing. Search is available as soon as documents sync.
- The `ftsWorkerBridge`, `ftsManager` (initFts/ftsNotifyUpdated), and client-side `indexDocument`/`indexBatch` code has been removed.
- ContentDto documents in CouchDB are larger due to the `fts` array (estimated ~30-50KB per document depending on text length).
- The API takes on the indexing cost, but trigram computation is fast (~1ms per document) and only runs once per content submission.
- A CouchDB schema upgrade (v13) backfills FTS data for all existing Content documents.
- `ftsMeta` no longer stores `docLen:*` entries or `fieldConfig` — doc lengths are stored directly on the ContentDto as `ftsTokenCount`, and field config is hard-coded.
- Corpus stats (`totalTokenCount`, `docCount`) are lazily recomputed rather than maintained incrementally. A debounced recomputation (10s) fires after ingestion or deletion, and an initial computation runs on startup. This avoids per-batch overhead during sync — BM25 scoring is tolerant of slightly stale stats.
