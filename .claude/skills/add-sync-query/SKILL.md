---
name: add-sync-query
description: Walk through adding a new Mango sync query end-to-end — the design doc (CouchDB index), the validator allowlist, the consumer's syncList registration, and the watcher in app/src/sync.ts or cms/src/sync.ts. Use when the user wants to "sync a new doc type", "add a Mango sync query", "register X in syncList", or hits a "sync query rejected by template" error.
---

# add-sync-query

Adding a sync target touches four places. Miss any one and either (a) the API rejects the query, (b) CouchDB does a full table scan, or (c) the client never asks for the data in the first place. This is a multi-file procedure with strict naming conventions.

## The four places

1. **Design doc** in `api/src/db/designDocs/sync-<type>-index.json` (and usually a sibling `sync-<type>-deleteCmd-index.json` for the delete-cmd column).
2. **Validator allowlist** in `api/src/db/MongoQueryTemplates/validators/sync.ts` — only matters if you need new selector fields beyond the existing allowlist (`updatedTimeUtc`, `type`, `memberOf`, `parentType`, `language`, `docType`).
3. **Consumer syncList** — register the doc type in `shared/`'s init config (passed in via `app/src/main.ts` / `cms/src/main.ts`).
4. **Watcher** in `app/src/sync.ts` or `cms/src/sync.ts` — adds the actual `sync({...})` call gated on permissions/connectivity.

## Procedure

### 1. Decide the doc type and column shape

Establish before writing files:

- DocType (e.g. `Post`, `Tag`, `Language`, or something new you're adding).
- Is it a "content" type (sharded by language, has a parentType)? Or a top-level type?
- CMS or App or both?
- Does it need a sibling `DeleteCmd` column? **Top-level types and Content types both do.**

### 2. Add the design doc(s)

Use `api/src/db/designDocs/sync-tag-index.json` as the canonical template:

```json
{
  "_id": "_design/sync-<type>-index",
  "language": "query",
  "views": {
    "sync-<type>-index": {
      "map": {
        "fields": { "updatedTimeUtc": "desc" },
        "partial_filter_selector": { "type": { "$eq": "<type-string>" } }
      },
      "reduce": "_count",
      "options": { "def": { "fields": ["updatedTimeUtc"] } }
    }
  }
}
```

Rules:

- File name **must** be `sync-<type>-index.json`. The validator regex requires `use_index` to start with `sync-` and end with `-index`.
- For content-type docs (parentType + language), include those in the `fields` array and adjust the partial_filter_selector. Check `sync-post-content-index.json` for the template.
- For DeleteCmd docs, also add `sync-<type>-deleteCmd-index.json` — see `sync-tag-deleteCmd-index.json`.

Design docs are picked up at API startup by `upsertDesignDocs(dbService)` in `main.ts`. After adding a JSON file, the API must be restarted for the index to materialize.

### 3. Verify the validator accepts your query shape

Open `api/src/db/MongoQueryTemplates/validators/sync.ts` and confirm:

- Your selector uses only allowed keys: `updatedTimeUtc`, `type`, `memberOf`, `parentType`, `language`, `docType`. Adding a new selector key requires extending `allowedSelectorKeys` here.
- The query has `limit`, `sort: [{ updatedTimeUtc: "desc" }]`, and a `use_index` matching `sync-*-index`.
- `selector.type !== "user"` (User syncing is explicitly disallowed).

If the user is asking for a fundamentally new query shape (e.g. sorting by something other than `updatedTimeUtc`), this validator is the gate — extending it is a significant change that needs review, not a quick edit.

### 4. Register in the consumer's syncList

The `syncList` is passed into `init()` from `app/src/main.ts` and `cms/src/main.ts` via the `SharedConfig`. Find the array (it's typically passed inline) and add an entry for the new type:

```ts
{ type: DocType.<NewType>, syncPriority: <N>, contentOnly: <true|false> }
```

- `syncPriority`: lower numbers sync first; mirror what existing similar types use.
- `contentOnly: true`: for types where docs live under a parent and are sharded by language (Content).

For the CMS, there's an exception pattern for `AutoGroupMappings` (in `cms/src/sync.ts`) — listed but `sync: false`. Use it as a reference if the new type is editable-only and never mirrored into Dexie.

### 5. Wire up the watcher in `<consumer>/src/sync.ts`

The watcher decides *when* to call `sync()`. Two iterators exist:

- `language` iterator — only `AuthProvider` and `Language` docs (the bootstrap layer). New types almost never go here.
- `content` iterator — everything else; ticks on accessMap, isConnected, and (app only) appLanguages change. New types go here.

Add a block following the existing pattern (see `app/src/sync.ts`):

```ts
if (access[DocType.<NewType>] && access[DocType.<NewType>].length) {
    sync({
        type: DocType.<NewType>,
        memberOf: access[DocType.<NewType>],
        // for Content types only:
        // subType: DocType.<NewType>,
        // languages: appLanguageIdsAsRef.value,
        limit: 100,
        cms: false,  // CMS side passes cms: true so QueryService skips published/expiry filters
    }).catch((err) => {
        Sentry?.captureException(err);
    });
}
```

For DeleteCmd: this is **not** a separate `sync()` call from the consumer. `Content` syncs pass `includeDeleteCmds: false` in the CMS (the parent-type sync already handles it). Top-level types pass `includeDeleteCmds: true` (the default).

### 6. Sanity checks before reporting

Run these in parallel via the shell:

- Confirm the new design doc(s) parse: `python3 -c "import json; json.load(open('api/src/db/designDocs/sync-<type>-index.json'))"` (or `jq . <file>` if jq is available).
- Grep for the new DocType in `app/src/sync.ts` / `cms/src/sync.ts` to confirm the watcher is registered.
- Grep for the new use_index name in the sync code to confirm it matches the file name exactly.

### 7. Report

- Files added/changed (with paths).
- Reminder: API needs restart for the new design doc to materialize the index.
- Reminder: if shared changed, run `/rebuild-shared`.
- Confirm: validator either accepts unchanged OR was extended (and explain why).

## What this skill is NOT

- Not a query author. The user provides the query intent; this skill is the wiring.
- Not a perf review. If the user expects high-volume sync, point them at `shared/src/rest/sync2/README.md`.
- Not a Vitest harness. Sync tests touch CouchDB and are user-driven.
