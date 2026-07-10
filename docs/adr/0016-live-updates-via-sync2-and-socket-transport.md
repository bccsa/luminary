# 16. Live updates via sync and a Socket.io transport

Date: 2026-06-06

## Status

Accepted

> **Note (2026-06-15):** After this decision, the sync engine referred to here as
> `sync2` was renamed to **`sync`** and moved from `shared/src/rest/sync2/` to
> `shared/src/api/sync/` (the whole `shared/src/rest/` directory became
> `shared/src/api/`). References to the current engine below use the new names; the
> now-deleted *legacy* `rest/sync.ts` is left at its original path. The ADR
> content remains historical; this file was later renumbered to 0016 only to
> resolve a duplicate ADR ID.

## Context

Live document updates arrive over Socket.io. Historically the Socket.io client
decided which incoming updates to persist to IndexedDB by filtering them against
the static `config.syncList` (`ApiSyncQuery[]`, hand-registered in each consumer's
`main.ts`). This was a *second, parallel declaration* of "what this client syncs,"
separate from the real source of truth — the `sync()` calls and `syncList` state
maintained by the sync engine (`shared/src/api/sync`). The two had to be kept in
lock-step by hand and could silently drift, so a client could subscribe to a socket
room and persist docs for a type sync wasn't actually managing (or vice versa).

Socket.io also joined its rooms once, statically, at the connect handshake
(`joinSocketGroups`) from that same `config.syncList`. There was no way to
subscribe to a doc type's live feed on demand — which `HybridQuery` needs for
non-synced types (data it shows live but never writes to IndexedDB, e.g. the CMS's
`User`/`AutoGroupMappings`, currently served by the soon-to-be-retired
`ApiLiveQuery`).

A dormant legacy sync engine (`shared/src/rest/sync.ts` + the `syncMap` machinery
in `db/database.ts`) also lingered — instantiated nowhere, but still exporting the
`syncActive` ref the CMS dashboard binds to.

## Decision

- **sync is the single source of truth for persistence.** The "may this doc be
  persisted to IndexedDB?" gate (`isSyncableDoc`) is derived from sync's live
  `syncList`, not `config.syncList`. A new sync-owned live persister
  (`api/sync/liveSync.ts`) subscribes to the `"data"` feed, applies that gate
  (plus the below-cutoff retention gate), and writes to Dexie.
- **Socket.io is a pure change-feed transport.** It owns connection lifecycle, the
  `clientConfig`/accessMap handshake, and `on`/`off`/`emit` passthroughs — it no
  longer filters or writes documents. Services (sync live persister, HybridQuery,
  ApiLiveQuery) subscribe to `"data"` and extract what they need.
- **Room subscriptions are dynamic and subscriber-tracked.** A new server contract
  (`joinRooms`/`leaveRooms`) lets the client subscribe/unsubscribe per doc type at
  runtime. A shared client-side manager (`socket/roomSubscriptions.ts`) tracks
  *which subscriber wants which doc type* (a `Map<DocType, Set<token>>`, not a bare
  ref-count) so a room is left only when its last subscriber releases it. sync
  drives rooms for synced types; HybridQuery drives them on demand for non-synced
  query types. `config.syncList` shrinks to a transitional live-only join list for
  `ApiLiveQuery` and disappears once that is retired.
- **The legacy sync is removed.** `rest/sync.ts` and the `syncMap` machinery are
  deleted; `syncActive` is rewired to reflect real sync activity.

> **Note (2026-06-25) — why deletions use a separate `DeleteCmd` doc, not doc pruning:**
> Because clients sync permission-scoped Mango `/query` windows (ordered by
> `updatedTimeUtc`), not CouchDB's `_changes`/replication feed, a document that
> leaves a client's filter scope — hard-deleted, unpublished (non-CMS clients only
> query `status:published`), or moved out of a group the client belongs to — simply
> stops appearing in future query windows while its stale copy lingers in local
> Dexie forever. `DeleteCmd` is the always-syncable, content-free, independently-routed
> signal that closes this blind spot (`isSyncable` returns `true` for it
> unconditionally; it carries `memberOf`/`newMemberOf` so it can be delivered to
> *removed* groups and let clients self-classify).
>
> We considered replacing it by **pruning the original doc** into a tombstone
> (keep the `_id`, strip heavy fields, flag it `deleted`, let it sync via the normal
> path — which, unlike a CouchDB `_deleted` tombstone, still shows up in Mango). The
> conclusion was to **keep `DeleteCmd`**, because the three triggers are not
> symmetric in how many *audiences* one event must serve:
>
> - **Permission change** has two audiences: retained-group clients (*keepers*, who
>   need the genuine update) and removed-group clients (*droppers*, who must delete).
>   The updated doc's new `memberOf` routes only to keepers; droppers no longer match
>   its scope. A single pruned doc carries one `memberOf` and routes one way, so it
>   cannot serve both — and a user in *both* a removed and a retained group must
>   **not** delete (handled today by the `verifyAccess(newMemberOf, …)` check, which
>   pruning would have to re-implement).
> - **Status change** also has two audiences needing opposite payloads of the same
>   `_id`: the CMS must keep editing the **full draft**, while app clients must drop
>   it and must **never receive draft content**. Pruning (stripping content) breaks
>   CMS editing; *not* pruning leaks unpublished content to public devices. CouchDB
>   stores one doc per `_id` and sync ships whole docs (no per-recipient field
>   projection), so this case inherently needs two representations — a full draft and
>   a content-free drop signal (which is a `DeleteCmd` by another name).
> - **Permanent deletion** is the only single-audience case (everyone holding the doc
>   must drop it), so a tombstone *would* work and is arguably cleaner (natural
>   last-write-wins, no orphan reconciliation). But adopting it only here means
>   running tombstones *and* `DeleteCmd` side by side, it relocates special-casing
>   from a separate type into every content read/query path (tombstones must be
>   filtered everywhere content, `availableTranslations`, and FTS corpus stats are
>   computed), saves no storage, and — per ADR 0005 — deployed clients understand
>   `DeleteCmd` but not a tombstone flag, forcing a long dual-path deprecation. The
>   simplification did not justify the cost.

## Consequences

- One definition of what's synced (sync); the `config.syncList` drift class of bug
  is gone.
- The Socket.io contract gains two **additive** messages (`joinRooms`/`leaveRooms`).
  `joinSocketGroups` is retained, so this is backwards compatible per ADR 0005: a
  new client against an old API still functions (just without dynamic rooms), and an
  old deployed client against the new API is unaffected (it keeps using
  `joinSocketGroups`).
- Synced-type rooms now appear shortly after connect (sync-driven) rather than at
  the handshake; live updates begin once joined. No data loss — the initial REST
  sync and reconnect re-join cover the gap.
- HybridQuery can live-update non-synced data by subscribing to rooms on demand and
  releasing them on dispose, paving the way for the CMS to drop `ApiLiveQuery`.
