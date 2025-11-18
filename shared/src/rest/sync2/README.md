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
  type: string;              // Document type or "type:parentType" (e.g., "content:post")
  memberOf: string[];        // Array of group IDs
  languages?: string[];      // Array of language codes (content types only)
  blockStart: number;        // Latest updatedTimeUtc in this chunk
  blockEnd: number;          // Oldest updatedTimeUtc in this chunk
  eof?: boolean;             // True when oldest available data is reached
}
```

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
import { initSync } from "./sync2";
import { httpService } from "./http";

initSync(httpService);
```

### `sync(options: SyncRunnerOptions)`

Start an autonomous sync runner for a specific document type.

**Options:**

- `type` (string): Document type or combined type:parentType (e.g., "content:post")
- `memberOf` (string[]): Array of memberOf group IDs to sync
- `languages` (string[]): Array of language codes (for content types only)
- `limit` (number): Maximum documents to fetch per request
- `cms` (boolean, optional): Flag indicating CMS sync

**Example:**

```typescript
import { sync } from "./sync2";

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
```

### `setCancelSync(value: boolean)`

Control the cancellation flag to stop or allow sync operations. The implementing application has full control over this flag and should manage it based on connectivity state.

**Parameters:**

- `value` (boolean): `true` to cancel/prevent sync operations, `false` to allow sync operations

**Example:**

```typescript
import { setCancelSync, sync } from "./sync2";
import { isConnected } from "./socket/socketio";
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

### `trim(options: { memberOf: string[]; languages?: string[] })`

Remove unused memberOf groups and languages from all syncList entries to prevent buildup.

**Options:**

- `memberOf` (string[]): Array of group IDs to keep
- `languages` (string[], optional): Array of language codes to keep

**Example:**

```typescript
import { trim } from "./sync2";

// Trim to keep only active groups and languages
trim({
    memberOf: ["group1", "group2"],
    languages: ["en", "es"],
});
```

**When to use trim:**

- After user leaves groups (remove old group data)
- After language preferences change (remove unused language data)
- Periodically to clean up unused sync state

## How Sync Works

### 1. Initial Sync

When `sync()` is called for the first time with specific parameters:

1. Checks for existing languages and groups in syncList
2. Spawns new runners for any new languages/groups
3. Continues existing runners for known languages/groups
4. Starts fetching from `Number.MAX_SAFE_INTEGER` (most recent) backwards

### 2. Iterative Fetching

The `runSync()` function performs these steps iteratively:

1. Calculates the next chunk range using `calcChunk()`
2. Builds a Mango query with appropriate selectors
3. Fetches documents from the API
4. Stores documents in IndexedDB using `db.bulkPut()`
5. Adds chunk to syncList
6. Performs vertical merge on the type
7. If EOF reached, performs horizontal merge
8. Otherwise, recursively calls itself for the next chunk

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

## Usage Patterns

### Basic Document Sync

```typescript
import { initSync, sync } from "./sync2";

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
import { sync, setCancelSync } from "./sync2";
import { isConnected } from "./socket/socketio";
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
// User left 'group3' - remove it from sync state
trim({
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
