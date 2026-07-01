# Luminary frontend shared library

`luminary-shared` contains the essential building blocks for building an
offline-first front-end against the Luminary sync API. It owns IndexedDB
(Dexie) storage, REST + Socket.io transport, document syncing, an offline
full-text search engine, permission/ACL evaluation, and a set of Vue 3
composables that bridge IndexedDB ↔ Vue reactivity.

Everything a consumer can use is re-exported from `src/index.ts`; this overview
groups that surface by area and links to the per-module deep-dive docs.

## Installation

```sh
npm install luminary-shared
```

`vue` and `dexie` are **peer dependencies** — the consumer must provide them, so
the library shares the consumer's single `vue`/`dexie` instance (Dexie live
queries and Vue reactivity break if two instances coexist). The published package
ships only the built `dist/` (ESM `index.js` + types); `vue`/`dexie` are kept
external.

### Local / monorepo consumption

When consuming from a sibling checkout, a plain `file:`/symlink install works as
long as the consumer resolves `vue` and `dexie` to a single copy. The
recommended setup is to consume the source directly and dedupe the singletons in
the consumer's bundler, which also gives hot-module reloading of library changes
without a rebuild:

- alias `luminary-shared` → `./src/index.ts` (bundler/dev only), and
- `dedupe` (or otherwise force a single copy of) `vue` and `dexie`.

The built `dist/` is still produced by `npm run build` for publishing and for
the consumer's TypeScript type resolution (`exports.types` → `dist/index.d.ts`),
so a type/signature change is picked up after a rebuild; behavioural changes hot
-reload from source with no rebuild.

## Getting started

A consumer calls `init(config)` once at startup. It sets the shared config,
opens the Dexie database, and brings up the Socket.io connection, REST sync, and
query layer.

```ts
import { init } from "luminary-shared";

await init({
    cms: false,
    apiUrl: "https://api.example.org",
    docsIndex: ",slug,parentTagType", // appended to the shared Dexie index
    appLanguageIdsAsRef: languageIds,  // Ref<Uuid[]>
});
```

| Export | Description |
| --- | --- |
| `init(config)` | One-shot startup: config → database → socket → REST sync → query layer. |
| `SharedConfig` | The single configuration object (`cms` flag, `apiUrl`, `docsIndex`, active-language ref, content cutoff, retention TTL). |
| `initConfig(config)` | Set/replace the shared config (called by `init`). |
| `getContentPublishDateCutoff()` | The configured content `publishDate` cutoff — single source of truth bounding sync depth and query routing. |
| `getOfflineRetentionTtl()` | Configured TTL for offline-persisted below-cutoff content. |
| `serverError`, `changeReqWarnings`, `changeReqErrors` | Reactive refs surfacing server-side errors/warnings to the UI. |

## Exported API overview

### Querying (reactive reads) — `src/util/`

The preferred way to read data. Pick the layer by where the data lives:

| Export | Description |
| --- | --- |
| **`HybridQuery` / `useHybridQuery`** | Local-first reactive query that reads the local Dexie cache and supplements it from the API for older / missing / non-synced docs. Supports one-shot or `live` mode, response caching, offline persistence, and reactive (thunk) queries. → [HybridQuery docs](src/util/HybridQuery/README.md) |
| `useHybridQueryWithState` (+ `UseHybridQueryState`) | Like `useHybridQuery` but returns `{ output, isFetching, error }` instead of just the `output` ref, for consumers that render loading / error UI. `useHybridQuery` is a thin wrapper that returns the `.output` of this. |
| `queryLocal` / `queryRemote` | Awaitable one-shot reads of the local IndexedDB cache / the remote `/query` API. The imperative counterparts to `useHybridQuery`. |
| `initHybridQuery(http)`, `DEFAULT_REMOTE_QUERY_LIMIT` | Wire the HTTP service (called by `init`); the default remote `$limit` (500). |
| `readResponseCache` / `writeResponseCache` / `structuralCacheKey` *(advanced)* | Low-level helpers backing `HybridQuery`'s `localStorage` response cache (first-paint seed). Exposed for tooling/tests; most consumers use the `cache` option instead. |
| **`useDexieLiveQuery` / `useDexieLiveQueryWithDeps`** | Vue 3 wrapper around Dexie's `liveQuery` — the preferred primitive for reading directly from IndexedDB. → [useDexieLiveQuery docs](src/util/useDexieLiveQuery/README.md) |
| **`mangoCompile` / `mangoToDexie`** | Mango-selector helpers: compile a selector to an in-memory predicate, or run a Mango query against a Dexie table with index pushdown. Plus `isProvablyEmpty`, `warmMangoCaches` (and the per-cache `clearMangoCache` / `getMangoCacheStats` / `clearDexieCache` / `getDexieCacheStats` management helpers). New to the selector syntax? Start with the [MangoQuery guide](src/util/MangoQuery/guide.md); reference docs: [MangoQuery docs](src/util/MangoQuery/README.md). |
| **`toEditable`** | Clone a source ref into an editable copy that tracks user vs. source modifications so external updates don't clobber in-progress edits. (`createEditable` is a deprecated alias.) → [toEditable docs](src/util/toEditable/README.md) |

### Database (IndexedDB / Dexie) — `src/db/`

| Export | Description |
| --- | --- |
| `db` | The Dexie database singleton (available after `initDatabase()`). Key methods: `db.upsert()` (write + queue for upload), `db.bulkPut()` (apply incoming docs incl. `DeleteCmd` resolution), `db.deleteRevoked()`, `db.deleteExpired()`, `db.purge()`, `db.validateDeleteCommand()`. |
| `initDatabase()`, `getDbVersion()` | Open the database; read the current (auto-bumped) schema version. |
| `isSyncableDoc(doc)` | The single "may this doc touch IndexedDB?" gate, derived from `syncList`. Used by the socket feed and offline persistence. |
| `touchRetention`, `flushRetention`, `evictStaleBelowCutoff` | Retention bookkeeping for offline-persisted below-cutoff content (TTL-based keep-alive + eviction). |

### Sync — `src/api/sync/`

Autonomous, incremental backwards-in-time sync per `(type, memberOf, languages)`.

| Export | Description |
| --- | --- |
| `initSync(http)` | Initialize the sync module (called by `init`). |
| `sync(options)` | Start/continue an autonomous sync runner for a doc type. |
| `setCancelSync(value)` | Kill switch the consumer drives from connectivity state (does not auto-reset). |
| `trim(options)` | Drop unused memberOf groups / languages from sync state. |

→ [Sync system docs](src/api/sync/README.md)

### Transport — `src/socket/`, `src/api/`

The socket client reports the configured **`cms` mode** (`config.cms`) to the server in its
`clientConfigReq` handshake (formerly `joinSocketGroups`, which the server still accepts as a
deprecated alias). The server uses it to scope which live-update rooms the connection joins, so a
CMS-mode consumer receives CMS-scoped documents (including drafts and expired content) while a
default consumer receives only published documents (expired content arriving as a body-less cleanup
signal). The mode is purely a request — the server enforces the corresponding permission.

| Export | Description |
| --- | --- |
| `getSocket()` | The Socket.io client singleton (change-feed transport + `clientConfig`). |
| `isConnected` | Reactive online/offline ref driving deferred API calls. |
| `maxUploadFileSize`, `maxMediaUploadFileSize` | Server-provided upload limits (reactive). |
| `subscribeRooms`, `setBaseRooms`, `initRoomSubscriptions` | Manage Socket.io room membership for synced and on-demand doc types. |
| `getRest()` | The REST client singleton (sync pulls + local-change pushes). |
| `HttpReq`, `setCustomHeader`, `removeCustomHeader` | HTTP service class and custom-header controls (e.g. auth). |

### Permissions — `src/permissions/`

| Export | Description |
| --- | --- |
| `verifyAccess(groups, docType, permission, "any"\|"all")` | The core ACL lookup against the current `accessMap`. |
| `accessMap` | Reactive `{ groupId: { docType: { permission: boolean } } }`, replaced wholesale by the server's `clientConfig`. |
| `hasAnyPermission(docType, permission)` | Whether any accessible group grants a permission on a doc type. |
| `getAccessibleGroups(permission)` | Inverts the access map to per-docType group lists. |

### Full-text search — `src/fts/`

Offline trigram + BM25 search, with automatic routing to a server `/fts`
endpoint when the local corpus is incomplete.

| Export | Description |
| --- | --- |
| **`useFtsSearch(query, options)`** | Debounced, paginated Vue composable; auto-routes local vs. server. |
| `ftsSearch` / `ftsSearchApi` / `shouldUseApiFts` | Direct local search / server search / the routing decision. |
| `generateTrigrams`, `stripHtml`, `normalizeText`, … | Trigram + text-normalization primitives. |
| `getCorpusStats`, `recomputeCorpusStats`, `scheduleCorpusStatsRecompute`, … | BM25 corpus-statistics maintenance. |

→ [Full-text search docs](src/fts/README.md)

### Media / S3 — `src/s3/`

| Export | Description |
| --- | --- |
| `testS3Credentials(input)` | Validate S3/MinIO credentials against a bucket. |
| `validateS3CredentialsFormat(credentials)` | Cheap client-side format check before a round-trip. |
| `useStorageStatus(buckets)` | Reactive composable that polls per-bucket connectivity status via the API, returning a reactive status map (`StorageStatusInfo` / `BucketWithStatus`). |

### Types — `src/types/`

The single client-side source of truth for document shapes and enums (the API
mirrors them). Exports all DTOs (`BaseDocumentDto`, `ContentDto`, `PostDto`,
`TagDto`, `LanguageDto`, `UserDto`, `DeleteCmdDto`, …) and enums (`DocType`,
`PublishStatus`, `TagType`, `PostType`, `AclPermission`, `MediaType`, …).

### Small utilities — `src/util/`

| Export | Description |
| --- | --- |
| `watchValue(source, …)` | Watch a ref/getter with value-equality semantics. |
| `filterAsync`, `someAsync` | Async `Array.filter` / `Array.some` helpers. |

## Module deep-dives

| Doc | Covers |
| --- | --- |
| [MangoQuery guide](src/util/MangoQuery/guide.md) | **Start here for querying** — a beginner-friendly, example-led tour of the Mango selector syntax used by `HybridQuery`. |
| [HybridQuery](src/util/HybridQuery/README.md) | Local-first query routing, live mode, caching, offline persistence, reactive queries. |
| [useDexieLiveQuery](src/util/useDexieLiveQuery/README.md) | The IndexedDB ↔ Vue reactivity primitive. |
| [toEditable](src/util/toEditable/README.md) | Editable clones of a source ref; user-vs-source change tracking, revert, save/baseline handoff. |
| [MangoQuery](src/util/MangoQuery/README.md) | `mangoCompile`, `mangoToDexie`, CouchDB parity, cache warming. |
| [Sync system](src/api/sync/README.md) | Autonomous runners, vertical/horizontal merge, cancellation, trimming. |
| [Full-text search](src/fts/README.md) | Trigram + BM25 engine, local/server routing, corpus stats. |

## Development

See [development.md](development.md) for build and test commands, and
`CLAUDE.md` for the full architecture reference.
