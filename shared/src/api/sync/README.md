# Sync System Documentation

## Overview

The sync system provides an autonomous, incremental synchronization mechanism for fetching documents from a remote API and storing them in IndexedDB. It works backwards in time from the latest `updatedTimeUtc` to older data, efficiently managing multiple document types, memberOf groups, and languages.

## Key Concepts

### Vertical and Horizontal Merging

The sync system uses a two-dimensional approach to organize and merge data:

- **Vertical Sync**: Fetches data backwards in time for the same document type, memberOf groups, and languages
- **Vertical Merge**: Combines adjacent time-based chunks that share the same filtering criteria
- **Horizontal Merge**: Combines different memberOf groups and languages that have complete (EOF reached) data for overlapping time ranges (for the same document type)

### Sync List Entries

Each sync operation creates entries in the `syncList` array with the following structure:

```typescript
{
  chunkType: string;         // Combined type + subType (e.g. "content:post", "deleteCmd:group")
  memberOf: string[];        // Array of group IDs
  languages?: string[];      // Array of language codes (content types only)
  blockStart: number;        // Latest updatedTimeUtc in this chunk
  blockEnd: number;          // Oldest updatedTimeUtc in this chunk
  eof?: boolean;             // True when oldest available data is reached
  publishDateMin?: number;   // Inclusive publishDate lower bound (Content / DeleteCmd entries only)
  publishDateMax?: number;   // Inclusive publishDate upper bound (Content / DeleteCmd entries only)
}
```

`chunkType` is the runner's `type` and optional `subType` joined as `"type:subType"`
(the `type` alone when there is no subType). The `publishDate*` bounds are set only on
`Content` and its sibling `DeleteCmd` entries — other chunk types have no `publishDate`
field and leave them undefined (treated as an open range).

**Language keep (Content).** `languages` is the language _set_ a Content column applies to. The
Content sync query does not filter by exact membership: it uses a **set-based priority-fallback
keep** — keep a doc if its `language` is in the set, OR (fallback) none of the set's languages has a
published translation of that document (so the doc's own translation is the last-resort fallback).
This lets a client hold every candidate translation it might display without syncing every language
(the ordered "best translation" pick is a display concern, not a keep concern). Consequently a Content
column is **not** language-disjoint — it also stores fallback docs whose own `language` is outside the
set; merge and `trim` key on the declared set, never on the docs' actual languages. With the `cms`
flag the keep degrades to a flat membership, since a CMS client syncs all languages and the fallback
branch is vacuous.

**DeleteCmd columns are language-unscoped** (`languages: undefined`): a delete of any downloaded doc —
including a fallback translation whose `DeleteCmd` carries a non-set language — must propagate, so one
unscoped `DeleteCmd` column covers every language.

### Autonomous Runners

The sync system spawns autonomous runners that:

- Split into multiple runners when new memberOf groups or languages are detected
- Continue independently until EOF (end of file) is reached
- Automatically merge with adjacent entries when appropriate

## Core Functions

> **Note on Cancellation**: The sync system provides a cancellation flag (`setCancelSync()`) that the implementing application must manage. Set it to `true` to stop sync operations (e.g., when offline) and `false` to allow sync (e.g., when online). The flag does NOT reset automatically - your application is responsible for managing it based on connectivity state.

### `initSync(httpService: HttpReq<any>)`

Initialize the sync module with an HTTP service before using any sync functions. (this is called internally in the Luminary Shared library)

```typescript
import { initSync } from "luminary-shared";

initSync(httpService);
```

### `sync(options: SyncRunnerOptions)`

Start an autonomous sync runner for a specific document type.

**Options** (`SyncRunnerOptions`):

- `type` (`DocType`): Document type to sync.
- `subType` (`DocType`, optional): Parent type for `Content` (e.g. `DocType.Post`) or the
  target docType for `DeleteCmd`. Combined with `type` to form the entry's `chunkType`.
- `memberOf` (string[]): Array of memberOf group IDs to sync.
- `languages` (string[], optional): Array of language IDs (content types only).
- `limit` (number): Maximum documents to fetch per request.
- `cms` (boolean, optional): Flag indicating CMS sync.
- `includeDeleteCmds` (boolean, optional): Also sync the sibling `DeleteCmd` column so
  deletions propagate. Defaults to `true`.
- `publishDateMin` / `publishDateMax` (number, optional): Inclusive `publishDate` bounds for
  the column. Only meaningful for `Content` (and its `DeleteCmd` sibling); leave undefined for
  other types — an undefined bound is treated as an open range.
- `source` (`SyncSource`, optional): Source-scoped sync state/storage target. When provided,
  `sync()` uses source mode (single-column `syncBatch` path) and does not add DeleteCmd companions.

> The `type`/`subType` examples below use illustrative type names (e.g. `"content:post"`) as
> shorthand for the resulting `chunkType`. In real calls `type` and `subType` are `DocType`
> enum values, e.g. `sync({ type: DocType.Content, subType: DocType.Post, … })`.

**Example:**

```typescript
import { sync } from "luminary-shared";

// Sync basic document type
await sync({
    type: "tag",
    memberOf: ["group1", "group2"],
    limit: 100,
});

// Sync content with specific languages
await sync({
    type: "content:post",
    memberOf: ["group1", "group2"],
    languages: ["en", "es", "fr"],
    limit: 100,
});

// Sync CMS content
await sync({
    type: "content:tag",
    memberOf: ["cms-group"],
    languages: ["en"],
    limit: 100,
    cms: true,
});

// Source mode (e.g. user-data source)
await sync({
    type: UserActivityType.Viewed,
    memberOf: ["*"],
    limit: 100,
    source: userSource,
});
```

### `setCancelSync(value: boolean)`

Control the cancellation flag to stop or allow sync operations. The implementing application has full control over this flag and should manage it based on connectivity state.

**Parameters:**

- `value` (boolean): `true` to cancel/prevent sync operations, `false` to allow sync operations

**Example:**

```typescript
import { setCancelSync, sync } from "luminary-shared";
import { isConnected } from "luminary-shared";
import { watch } from "vue";

// Watch for connectivity changes and control sync accordingly
watch(isConnected, async (connected) => {
    if (!connected) {
        // Set cancel flag to true when offline - stops all running sync operations
        setCancelSync(true);
    } else {
        // Set cancel flag to false when online - allows sync to run
        setCancelSync(false);

        // Restart sync now that we're online
        await sync({
            type: "lesson",
            memberOf: userGroups,
            limit: 100,
        });
    }
});
```

**Important Notes:**

- **App Responsibility**: The implementing application must manage the cancel flag. It won't reset automatically.
- **Keep it set while offline**: Set to `true` when connectivity is lost and keep it `true` until connectivity is restored.
- **Set to false when ready**: Set to `false` before calling `sync()` to allow operations to proceed.
- **Multiple runners**: The flag affects all running sync operations across all document types.

**When to use:**

- Set to `true`: When device loses network connectivity, app goes into background, or user manually stops sync
- Set to `false`: When connectivity is restored, app comes to foreground, or ready to restart sync

### `trim(options: SyncBaseOptions)`

Remove unused memberOf groups and languages from the syncList entries **matching the given
`type`/`subType`** (i.e. one chunk type per call), to prevent unused group/language buildup.
Entries that lose all their groups or languages are dropped entirely.

**Options** (`SyncBaseOptions`):

- `type` (`DocType`): The document type whose entries to trim.
- `subType` (`DocType`, optional): Parent type / target docType narrowing the `chunkType`.
- `memberOf` (string[]): Group IDs to **keep** (others are removed).
- `languages` (string[], optional): Language IDs to keep (content types only).
- `publishDateMin` / `publishDateMax` (number, optional): When set, `Content` entries fully
  outside this range are dropped and partially-overlapping ones are clamped to the intersection.
  `DeleteCmd` entries are always kept open so deletes keep propagating.

**Example:**

```typescript
import { trim, DocType } from "luminary-shared";

// Keep only active groups and languages for content:post entries
trim({
    type: DocType.Content,
    subType: DocType.Post,
    memberOf: ["group1", "group2"],
    languages: ["en", "es"],
});
```

**When to use trim:**

- After user leaves groups (remove old group data)
- After language preferences change (remove unused language data)
- Periodically to clean up unused sync state

> Note: on access **revoke**, `db.deleteRevoked()` already calls `trim()` automatically (once per
> distinct chunkType, keeping the still-accessible groups) so the syncList stays consistent with the
> docs it evicts. A column left at `eof` after its docs are removed would otherwise block the re-walk
> when access is later re-granted.

## How Sync Works

### 1. Initial Sync

When `sync()` is called for the first time with specific parameters:

1. Checks for existing languages and groups in syncList
2. Spawns new runners for any new languages/groups
3. Continues existing runners for known languages/groups
4. Starts fetching from `Number.MAX_SAFE_INTEGER` (most recent) backwards

### 2. Iterative Fetching

The `syncBatch()` function performs these steps iteratively:

1. Calculates the next chunk range using `calcChunk()`
2. Builds a Mango query with appropriate selectors
3. Fetches documents from the API
4. Stores documents in IndexedDB using `db.bulkPut()`
5. Adds chunk to syncList
6. Performs vertical merge on the type
7. If EOF reached, performs horizontal merge
8. Otherwise, recursively calls itself for the next chunk

In source mode (`options.source` set), `syncBatch` writes fetched docs through
`source.put(...)`, reads/writes `source.syncList`, sends `dataSource: source.name`
to the API query, and omits the default `memberOf` selector injection. It awaits
`source.setSyncList()` after each page and EOF transition, before requesting the next
page. Interrupted pulls therefore retain a durable cursor. Source pulls do not affect
the default-source `syncActive` indicator and do not start DeleteCmd companions.

### Source orchestration

`createDataSource(config)` opens an isolated database, restores its cursor, and wires
its outbound queue. Both pulls and uploads require connectivity, an advertised source
name in `clientConfig.dataSources`, and the optional caller `ready` ref. An absent
capability keeps local edits queued for a future compatible server.

- `pull()` retries a stalled uploader and starts one pull at a time. It defers pulling
  while changes remain queued; draining the queue triggers the pull automatically.
- `flush(timeoutMs)` restarts a stalled uploader and waits up to the deadline. It returns
  `false` when the queue remains or transport is unavailable, retaining queued changes.
- Foregrounding a document triggers the same queue retry and pull checks.
- `paceMs` spaces uploads while a backlog drains. Quiet acknowledgements keep rejected
  local documents when the server supplies no replacement and leave global UI messages alone.
- Incoming writes check pending edits in a database transaction. Source `upsert()` commits
  the document and queue entry together, replacing earlier queued edits for the same id when
  `overwriteLocalChanges` is set.
- `clear()` removes source data and cursor state and invalidates older in-flight pulls.
  Responses for cleared queue entries cannot restore documents through an acknowledgement.
- `dispose()` removes the foreground listener, stops watchers and joins outstanding work.

Direct `sync({ source, ... })` callers own the source's `put` and persistence callbacks.
An optional `source.isCancelled()` guard lets them discard responses after readiness or
ownership changes. The default sync column, room subscriptions and HybridQuery stay independent.

### 3. Chunk Calculation

The `calcChunk()` function determines the time range for the next API query:

- **Initial sync**: `blockStart = MAX_SAFE_INTEGER`, `blockEnd = firstBlockStart - tolerance`
- **Continuation**: `blockStart = previousBlockEnd`, `blockEnd = nextBlockStart`

The tolerance (1000ms) helps prevent gaps in synced data during initial sync.
Sync blocks overlap with one entry to ease vertical merging.

### 4. Vertical Merging

After each fetch, `mergeVertical()` combines adjacent chunks with:

- Same type
- Same memberOf groups
- Same languages
- Consecutive time ranges

This consolidates the sync history as data is fetched.

### 5. Horizontal Merging

When EOF is reached, `mergeHorizontal()` combines chunks with:

- Same type
- Different memberOf groups OR languages
- Both chunks have `eof: true`
- Overlapping time ranges

This creates broader coverage across groups and languages.

## API Query Format

The sync system constructs Mango queries in this format:

```javascript
{
  selector: {
    type: "lesson",
    updatedTimeUtc: { $lte: blockStart, $gte: blockEnd },
    memberOf: { $elemMatch: { $in: ["group1", "group2"] } },
    // For content types:
    parentType: "post",
    language: { $in: ["en", "es"] },
    // If CMS:
    cms: true
  },
  limit: 100,
  sort: [{ updatedTimeUtc: "desc" }],
  use_index: "sync-lesson-index"
}
```

For source mode the query additionally carries `dataSource: <source name>` and omits the
default `memberOf` selector clause.

## Usage Patterns

### Basic Document Sync

```typescript
import { initSync, sync } from "luminary-shared";

// Initialize once at app startup
initSync(httpService);

// Sync lessons for user's groups
await sync({
    type: "lesson",
    memberOf: userGroups,
    limit: 100,
});
```

### Content Sync with Languages

```typescript
// Sync blog posts in multiple languages
await sync({
    type: "content:post",
    memberOf: userGroups,
    languages: userLanguages,
    limit: 100,
});
```

### Adding New Groups/Languages

The sync system automatically handles additions:

```typescript
// First sync with initial groups
await sync({
    type: "lesson",
    memberOf: ["group1"],
    limit: 100,
});

// Later, add more groups - sync will handle both old and new
await sync({
    type: "lesson",
    memberOf: ["group1", "group2", "group3"],
    limit: 100,
});
```

### Handling Connectivity Changes

Use `setCancelSync()` to control synchronization based on connectivity state:

```typescript
import { sync, setCancelSync } from "luminary-shared";
import { isConnected } from "luminary-shared";
import { watch } from "vue";

// Watch for connectivity changes
watch(isConnected, async (connected) => {
    if (!connected) {
        // Stop all running sync operations when connection is lost
        // Keep the flag set to true while offline
        setCancelSync(true);
    } else {
        // Allow sync operations when connection is restored
        setCancelSync(false);

        // Restart sync for all required document types
        await sync({
            type: "lesson",
            memberOf: userGroups,
            limit: 100,
        });

        await sync({
            type: "content:post",
            memberOf: userGroups,
            languages: userLanguages,
            limit: 100,
        });
    }
});
```

**Important**: Always set `setCancelSync(false)` before calling `sync()` when you want synchronization to proceed.

### Removing Groups/Languages

Use `trim()` to clean up unused data:

```typescript
// User left 'group3' - remove it from the content:post sync state
trim({
    type: DocType.Content,
    subType: DocType.Post,
    memberOf: ["group1", "group2"],
    languages: currentLanguages,
});
```

### CMS Content Sync

```typescript
// Sync CMS-specific content
await sync({
    type: "content:article",
    memberOf: cmsGroups,
    languages: ["en"],
    limit: 100,
    cms: true,
});
```

## State Management

The `syncList` array maintains the sync state and is automatically persisted to IndexedDB:

- **Automatic persistence**: Changes to syncList are automatically saved to IndexedDB using Vue's watch mechanism
- **Initialization**: syncList is loaded from IndexedDB when `initSync()` is called
- **Offline resume**: Sync can resume from where it left off after app restart or network interruption
- **Purge**: syncList is cleared when the database is purged

## Best Practices

1. **Initialize once**: Call `initSync()` once at application startup
2. **Consistent limits**: Use the same `limit` value for a given type to ensure predictable behavior
3. **Regular trimming**: Call `trim()` when user preferences change (groups, languages)
4. **Manage cancel flag**: Always manage `setCancelSync()` in response to connectivity changes - set to `true` when offline, `false` when online
5. **Reset before sync**: Ensure cancel flag is `false` before calling `sync()` to allow operations to proceed
6. **Error handling**: Wrap sync calls in try-catch blocks for network error handling
7. **Background sync**: Consider running sync operations in background workers
8. **Monitor progress**: Track syncList entries to show sync progress to users

## Error Handling

```typescript
try {
    await sync({
        type: "lesson",
        memberOf: userGroups,
        limit: 100,
    });
} catch (error) {
    if (error.message === "Invalid API response format") {
        // Handle API format errors
    } else if (error.message === "Sync module not initialized with HTTP service") {
        // Handle initialization errors
    } else {
        // Handle other errors (network, etc.)
    }
}
```

## Performance Considerations

- **Limit size**: Smaller limits (50-100) provide more granular progress tracking; larger limits (500-1000) reduce API calls
- **Concurrent runners**: Multiple autonomous runners operate independently, enabling parallel sync
- **IndexedDB batching**: Uses `bulkPut()` for efficient batch storage
- **Memory usage**: syncList grows with more types/groups/languages; use `trim()` to manage size

## Future Enhancements

- Progress tracking events/callbacks
- Configurable sync tolerance
- Adaptive limit sizing based on network conditions
