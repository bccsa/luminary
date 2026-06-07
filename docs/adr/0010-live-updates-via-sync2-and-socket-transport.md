# 10. Live updates via sync2 and a Socket.io transport

Date: 2026-06-06

## Status

Accepted

## Context

Live document updates arrive over Socket.io. Historically the Socket.io client
decided which incoming updates to persist to IndexedDB by filtering them against
the static `config.syncList` (`ApiSyncQuery[]`, hand-registered in each consumer's
`main.ts`). This was a *second, parallel declaration* of "what this client syncs,"
separate from the real source of truth — the `sync()` calls and `syncList` state
maintained by the sync2 engine (`shared/src/rest/sync2`). The two had to be kept in
lock-step by hand and could silently drift, so a client could subscribe to a socket
room and persist docs for a type sync2 wasn't actually managing (or vice versa).

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

- **sync2 is the single source of truth for persistence.** The "may this doc be
  persisted to IndexedDB?" gate (`isSyncableDoc`) is derived from sync2's live
  `syncList`, not `config.syncList`. A new sync2-owned live persister
  (`rest/sync2/liveSync.ts`) subscribes to the `"data"` feed, applies that gate
  (plus the below-cutoff retention gate), and writes to Dexie.
- **Socket.io is a pure change-feed transport.** It owns connection lifecycle, the
  `clientConfig`/accessMap handshake, and `on`/`off`/`emit` passthroughs — it no
  longer filters or writes documents. Services (sync2 live persister, HybridQuery,
  ApiLiveQuery) subscribe to `"data"` and extract what they need.
- **Room subscriptions are dynamic and subscriber-tracked.** A new server contract
  (`joinRooms`/`leaveRooms`) lets the client subscribe/unsubscribe per doc type at
  runtime. A shared client-side manager (`socket/roomSubscriptions.ts`) tracks
  *which subscriber wants which doc type* (a `Map<DocType, Set<token>>`, not a bare
  ref-count) so a room is left only when its last subscriber releases it. sync2
  drives rooms for synced types; HybridQuery drives them on demand for non-synced
  query types. `config.syncList` shrinks to a transitional live-only join list for
  `ApiLiveQuery` and disappears once that is retired.
- **The legacy sync is removed.** `rest/sync.ts` and the `syncMap` machinery are
  deleted; `syncActive` is rewired to reflect real sync2 activity.

## Consequences

- One definition of what's synced (sync2); the `config.syncList` drift class of bug
  is gone.
- The Socket.io contract gains two **additive** messages (`joinRooms`/`leaveRooms`).
  `joinSocketGroups` is retained, so this is backwards compatible per ADR 0005: a
  new client against an old API still functions (just without dynamic rooms), and an
  old deployed client against the new API is unaffected (it keeps using
  `joinSocketGroups`).
- Synced-type rooms now appear shortly after connect (sync2-driven) rather than at
  the handshake; live updates begin once joined. No data loss — the initial REST
  sync and reconnect re-join cover the gap.
- HybridQuery can live-update non-synced data by subscribing to rooms on demand and
  releasing them on dispose, paving the way for the CMS to drop `ApiLiveQuery`.
