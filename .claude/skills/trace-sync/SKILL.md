---
name: trace-sync
description: Investigation playbook for why a document isn't syncing to a client (app or CMS) as expected. Walks the full sync path — syncList registration, permissions, connectivity, design docs, socket rooms, bulkPut filters. Use when the user reports "doc X isn't showing up", "sync seems stuck", "I edited X in the CMS but the app doesn't see it", or similar.
---

# trace-sync

A doc not showing up at the client can be any of ~8 different things. This skill walks them in order of probability, narrowing down where the chain breaks.

This is **read-only investigation**. Don't edit code, don't restart services, don't bump versions. Report findings; let the user fix.

## What you need from the user before starting

Ask if any are missing:

- Which **client**? App or CMS.
- Which **doc type**? (`Post`, `Tag`, `Content`, `Language`, etc.)
- A specific **doc id** if they have one.
- What they **expected** vs **observed**. ("New post not visible" vs "edits to existing post not reflecting" vs "doc disappeared".)
- Are they **online**? Sync only happens when `isConnected` is true.

## The chain (walk in order)

### 1. Is the doc type in the consumer's syncList?

Check `app/src/sync.ts` (or `cms/src/sync.ts`) for a `sync({ type: DocType.<X>, ... })` call. If the doc type isn't listed, it's not synced — full stop.

For Content docs, check the parent type (Post/Tag) and confirm the parent's content sync block exists.

### 2. Is there a design doc for it on the API?

```sh
ls api/src/db/designDocs/sync-<type>-index.json
```

If missing, sync requests for this type will either fail validation (`use_index` mismatch) or hit a full table scan. Look for warnings in API logs about missing indexes.

### 3. Does the user have View permission?

The sync filter is `access[DocType.<X>]` from `getAccessibleGroups(AclPermission.View)`. Walk:

- What groups is the user a member of? Check `User.memberOf` on their User doc.
- What ACL entries do those groups have for this doc type? Check the Group docs' `acl` field.
- Does the `accessMap` in the client's localStorage contain the expected `{ groupId: { docType: { View: true } } }`?

If no View grant: nothing will sync. This is by design.

For Content docs, the permission is checked against the **parent's** type (Post/Tag), not Content. `QueryService.accessMapToGroups` resolves this.

### 4. Is the client actually connected?

- `isConnected` ref from shared. False → all sync skipped, `setCancelSync(true)` called.
- Check for `connect_error` events. The most common cause is `auth_failed` (`AuthFailureReason`). In `app/src/main.ts` and `cms/src/main.ts` there's a handler that catches `provider_not_found`, `token_invalid`, etc. and triggers eviction/refresh.

### 5. Did the doc reach IndexedDB?

In the browser DevTools (user-side investigation; you can only describe how):

- Open Application → IndexedDB → `luminary` → `docs` table.
- Search for the doc id. If present, the sync delivered it — the bug is in display/query.
- If absent: sync did not deliver. Continue down the chain.

Also check `localChanges` table — if the doc was edited by this client and the change is pending upload, it's stuck there until the next `syncLocalChanges` run.

### 6. Did the server-side stale-delete guard drop it?

`shared/src/db/database.ts`'s `bulkPut` skips deletes whose target doc is already newer in local storage. If the user is seeing a delete not propagate, this is the most likely cause — but it's an intentional guard against stale `DeleteCmd` overwriting fresh edits.

### 7. Is the doc in the right group's memberOf?

For server-side sourcing: the doc must have `memberOf: [<groupId>]` matching a group the user can View. Content docs inherit `memberOf` from their parent (Post/Tag).

Check via the API:

```sh
curl -u admin:<pw> http://localhost:5984/<db>/<docId>
```

(User runs this — you can describe the command.)

### 8. Socket room delivery (for live updates only)

For real-time updates (not initial sync), the doc flows through Socket.io rooms `${docType}-${groupId}`. The server emits to the room when `DbService` fires an `update` event. If the user is missing **live** updates but a manual refresh works, the issue is room membership — check what rooms the client joined on `joinSocketGroups` (server-side `socketio.ts`).

### 9. CMS-specific: language scoping

The CMS sync `content` iterator only ticks when at least one CMS language is selected (`cmsLanguageIdsAsRef.value.length > 0`). If a CMS user reports no Content syncing, check whether they've picked a language.

The App equivalent is `appLanguageIdsAsRef` — also required to be non-empty before content syncs.

## Procedure

1. Confirm scope with the user (see "What you need from the user").
2. Walk the chain in order. For each step, either:
   - Read the relevant file / state to verify.
   - Or describe to the user what they should check (DevTools, CouchDB).
3. Stop at the first broken link. Report what's broken and where.

Don't keep walking past a confirmed break — fix proposals belong in a follow-up, not this skill.

## Report structure

```
Doc type: <X>   Client: <app|cms>
Symptom: <what the user reported>

Chain walk:
  [1] syncList registration ........ OK / MISSING (in <file>:<line>)
  [2] design doc .................. OK / MISSING (api/src/db/designDocs/sync-<x>-index.json)
  [3] View permission ............. OK / DENIED (user is in groups <a,b>; doc's memberOf is <c>)
  [4] isConnected ................. true / false (last error: <…>)
  [5] reached IndexedDB ........... unknown — user to check DevTools
  [6] stale-delete guard .......... — / triggered (see shared/src/db/database.ts:bulkPut)
  [7] memberOf alignment .......... OK / mismatch
  [8] socket room ................. — (only matters for live updates)
  [9] language scope (CMS) ........ N/A / OK / no language selected

Conclusion: <one-line diagnosis>
Suggested next step: <one-line next action for the user>
```

Don't fix. Just diagnose.

## What this skill is NOT

- Not a code editor. Diagnose only.
- Not a CouchDB admin tool. You can describe queries, but the user runs them.
- Not for performance issues. If sync is slow but eventually delivers, the diagnosis is in `shared/src/rest/sync2/README.md`, not here.
