# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this package is

`luminary-shared` is a Vue 3 frontend library that consumers (the Luminary APP and CMS) install to talk to the Luminary sync API. It owns: IndexedDB (Dexie) storage, REST + Socket.io transport, document syncing, an offline FTS search engine, permissions/ACL evaluation, and a set of Vue composables (`useDexieLiveQuery`, `ApiLiveQuery`, `toEditable`, …) that bridge IndexedDB ↔ Vue reactivity.

This is published to npm as `luminary-shared`. The bundle is the lib output from `src/index.ts`; everything callers can use is re-exported there.

Because it's a standalone published library, its documentation (this file and the `README`s under `src/**`) must stay generic and self-contained: describe the library's own contract/API, never how a consumer (the app or CMS) computes values or wires things up. No narrative references to "the app"/"the CMS"/editors, consumer components or constants, or links into `app/`/`cms/` docs. Generic "caller"/"consumer"/"application" wording and the library's own API (e.g. the `SharedConfig.cms` flag) are fine. Document consumer-specific behavior in that consumer's own docs instead.

## Common commands

```sh
npm run dev           # vite dev server (rarely needed — this is a library, not an app)
npm run build         # vue-tsc + vite build → dist/
npm run test          # vitest run (one-shot)
npm run test:watch    # vitest watch mode (test:unit is an alias for the same)
npm run lint          # eslint .vue/.ts/.cjs/.mjs/.tsx
npm run lint:fix
npm run format        # prettier --write src/
npm run type-check    # vue-tsc --noEmit + vite build
```

Run a single test file: `npx vitest run src/path/to/file.spec.ts`
Run a single test by name: `npx vitest run -t "test name pattern"`

## Local install in consuming projects

Installing this package via plain `npm install ../shared` breaks IndexedDB reactivity because the symlink hides the real package boundary from Dexie. Always use the `--install-links` flag when installing from a sibling checkout:

```sh
npm install --install-links ../shared
```

After making local changes, run `npm run build` here, then re-run the install command in the consuming project.

## Architecture

### Entry point and initialization

`src/luminary.ts` exposes a single `init(config)` that, in order, sets the shared config, opens Dexie (`initDatabase`), creates the Socket.io connection (`getSocket`), and starts the REST sync (`getRest` + `initSync`). Calling code does this once at app startup. The exported surface area for consumers is everything in `src/index.ts`.

`SharedConfig` (`src/config.ts`) is the single configuration object: `cms` flag, app-specific `docsIndex` string appended to the shared Dexie index, `apiUrl`, the `syncList` of doc-type sync queries, and a `Ref<Uuid[]>` of active language IDs (used by Socket.io and FTS filtering).

### Data layer — `src/db/database.ts`

One Dexie `Database` class wraps four tables:

- `docs` — all documents (Posts, Tags, Content, Languages, Groups, etc.) keyed by `_id`. The index string is built by concatenating a fixed shared index (`_id,type,parentType,language,expiryDate,parentId,publishDate,[type+tagType],*fts`) with the consumer's `docsIndex`. The `*fts` MultiEntry index powers offline trigram search.
- `localChanges` — outgoing change queue; written to by `db.upsert()` and drained by `syncLocalChanges`.
- `queryCache` — generic query result cache (`MangoQuery/queryCache.ts`).
- `luminaryInternals` — key/value store for `syncMap`, `syncList`, FTS `corpusStats`, etc.

Schema versioning is **automatic**: `bumpDBVersion` compares the JSON-serialized index against the previous one in `localStorage["dexie.dbIndex"]` and bumps the Dexie version when it changes. You usually don't need to manage versions manually — just add fields to the index string and the next load will migrate.

The exported singleton is `db`, available after `initDatabase()` resolves. `db.upsert(...)` is the standard write path: it writes to `docs` and queues a `localChange` for upload (or, for deletes with `deleteReq`, removes from `docs` and queues the delete). `db.bulkPut(docs)` handles incoming docs from the API including `DeleteCmd` resolution (with a stale-delete guard — skips deletes whose target is already newer).

`db.deleteRevoked()` removes any docs the user no longer has access to. It is driven by a watcher on `accessMap` (set up in `initDatabase`) that fires on map changes — **not** immediately at init, and it short-circuits when `accessMap` is empty: an empty map is the not-loaded `useLocalStorage` default, not "no access", and purging on it would delete every group/doc before the server's `clientConfig` populates the real map. Full teardown (logout) goes through `db.purge()` instead, which also clears `syncList`. `db.deleteExpired()` purges past-expiry docs on non-CMS clients on startup.

### Sync — `src/api/sync/`

The sync system is documented in detail in `src/api/sync/README.md`. Read it before changing sync code. Quick model:

- Walks backwards in time per `(type, memberOf-set, languages-set)` "column," storing block ranges in `syncList`.
- Splits into multiple autonomous runners when new groups/languages are added; recombines via **vertical merge** (adjacent time ranges, same key) and **horizontal merge** (overlapping ranges, different groups/languages, both EOF).
- `setCancelSync(true/false)` is a kill switch the consumer must drive based on connectivity — it does not auto-reset.
- `DeleteCmd` documents are synced as a sibling column to each content/post/tag column so deletions propagate even past the initial sync window.

`src/api/syncLocalChanges.ts` drains the `localChanges` table to the API and applies ack/reject responses via `db.applyLocalChangeAck`.

### Socket.io live updates — `src/socket/socketio.ts`

The socket emits `joinSocketGroups` on connect with the configured `syncList`, then pushes `data` events. Incoming docs are filtered against `syncList` and `appLanguageIdsAsRef` before being bulk-put into Dexie. `accessMap` and `maxUploadFileSize` are received via a `clientConfig` event. Auth failures (`err.message === "auth_failed"`) disable reconnection so a stale token doesn't loop.

`isConnected` is a Vue ref that drives `ApiLiveQuery`'s online/offline behavior.

### Permissions — `src/permissions/permissions.ts`

`accessMap` is a `useLocalStorage` ref of `{ groupId: { docType: { permission: boolean } } }`. `verifyAccess(groups, docType, permission, "any"|"all")` is the lookup; `getAccessibleGroups(permission)` inverts it to per-docType group lists (used by `deleteRevoked`). The map is replaced wholesale by the server's `clientConfig` socket event.

### Vue reactivity utilities — `src/util/`

The library's "public composable" surface:

- **`useDexieLiveQuery` / `useDexieLiveQueryWithDeps`** (`util/useDexieLiveQuery/`) — Vue 3 wrapper around Dexie's `liveQuery`. This is the **preferred** way to read from IndexedDB; the older `db.toRef`, `db.getAsRef`, `db.whereTypeAsRef`, etc. on the `Database` class are deprecated and log a warning when called.
- **`useDexieLiveQueryAsEditable`** *(deprecated)* — same but wraps the result with `toEditable` so the UI can edit a copy and diff against the source.
- **`toEditable`** — converts a source ref into a clone that the UI can mutate. Tracks user vs. source modifications so external updates don't clobber in-progress edits. (Formerly `createEditable`, which remains as a deprecated alias.)
- **`ApiLiveQuery` / `ApiLiveQueryAsEditable`** (`util/ApiLiveQuery/`) — same idea but talks to the REST API + Socket.io directly instead of IndexedDB. Used for queries that can't or shouldn't be cached locally (e.g. CMS searches).
- **`MangoQuery/`** — Mango-syntax query helpers. `mangoCompile(selector)` returns an in-memory predicate; `mangoToDexie(table, query)` translates a Mango query into a Dexie `Collection` with index pushdown where possible and an in-memory filter for the rest. Both use template-based caching (structure normalized, values extracted) with `localStorage` persistence via `warmMangoCaches()`. See `mangoCompile.md` and `mangoToDexie.md`.
- **`asyncArray`** (`filterAsync`, `someAsync`), **`watchValue`** — small async/reactivity utilities used across the lib.

### Full-text search — `src/fts/`

Offline fuzzy search using **trigram indexing + BM25**. Read `src/fts/README.md` before changing FTS code. Key points:

- FTS data is computed server-side and shipped on `ContentDto.fts` as `string[]` of `"trigram:tf"` entries; Dexie indexes the array via the `*fts` MultiEntry index.
- Searches use `db.docs.where("fts").between(trigram + ":", trigram + ";")` per trigram, parse TF, compute BM25 against `corpusStats` (stored under `luminaryInternals["corpusStats"]`).
- `scheduleCorpusStatsRecompute()` is debounced (10s) and called from every doc-mutation path (`bulkPut` with content, `deleteRevoked`, `deleteExpired`, `purge`) plus on startup.
- The field config (title=3.0, summary=1.5, text=1.0, author=1.0) and BM25 params are **hard-coded identically** in `api/src/util/ftsIndexing.ts`, `api/src/util/ftsScoring.ts`, and `shared/src/fts/ftsSearch.ts` — if you change one, change all (ADR 0009/0010).
- **Routing (ADR 0011):** `useFtsSearch` routes each search to local (offline, or no `publishDate` cutoff — full sync, incl. the CMS) or the server-side `/fts` endpoint (online + a `publishDate` cutoff is set) via `shouldUseApiFts()` + `ftsSearchApi`. Single source per search (no merge); falls back to local on API failure and exposes `source` / `isPartial`. **Server results are trimmed (`fts`/`ftsTokenCount` stripped) and must never be `bulkPut`/persisted** — they'd break the `*fts` offline index.
- Local search optimizations (perf): high-df trigram pruning, a language pre-filter before loading docs, and top-K-only word-match. See `README.md`.
- Consumer surface is `useFtsSearch(query, options)` (Vue composable, debounced, paginated) or `ftsSearch(opts)` / `ftsSearchApi(opts)` (direct calls).

### Types — `src/types/`

`dto.ts` defines all document DTOs (`BaseDocumentDto`, `ContentDto`, `PostDto`, `TagDto`, `LanguageDto`, `UserDto`, `DeleteCmdDto`, etc.). `enum.ts` defines `DocType`, `PublishStatus`, `TagType`, `PostType`, `AclPermission`, `MediaType`, etc. These are the single source of truth — the API mirrors them, but this package owns the client-side shape.

## Test setup

Tests run under Vitest + jsdom + `fake-indexeddb/auto`. Mock data lives in `src/tests/mockdata.ts` (mock languages, content, tags, posts).

`vitest.setup.ts` intercepts `console.warn` and **fails the test** if it sees a Dexie or `mangoToDexie` "missing index" / "full table scan" warning. If you legitimately need to test warning behavior, spy on `console.warn` with `mockImplementation` — that replaces the original so the setup hook never sees it. If you hit this failure in normal work, the right answer is almost always to add the missing index, not to silence the warning.

## Build output

The lib is built by Vite (`vite.config.ts`) using `rollup-plugin-auto-external` to keep all dependencies external (consumers' `node_modules` resolve them) and `vite-plugin-dts` to emit `dist/index.d.ts`. `minify: false` is intentional — consuming apps minify the combined bundle. `stats.html` is the rollup-visualizer output; open it when reviewing bundle size.
