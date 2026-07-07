# 13. CMS view permission (`CmsView`) and CmsView-scoped live rooms

Date: 2026-06-25

## Status

Accepted

## Context

Luminary's CMS shows more than the app: drafts, scheduled, and expired Content. Historically the
only thing separating "what the app sees" from "what the CMS sees" was a `cms` flag on each read
(`POST /query`, `POST /fts`) and on sync — an **unchecked toggle**. Any caller with plain `View` on
a group could set `cms: true` and receive that group's drafts/expired Content. Concretely (GitHub
#160):

- `POST /query` with `cms: true` skipped the published/expiry/language filters with **no permission
  check** (the long-standing `TODO: Get view permissions based CMS access`).
- `POST /fts` with `cms: true` let drafts/expired through with only a `View` check.
- Socket.io broadcast **every** Content update — including drafts — to the `${docType}-${group}`
  rooms that clients join on plain `View`.

There was no permission expressing "this user may see CMS content", so the boundary couldn't be
enforced. We also needed live updates to honour it without leaking drafts to the app, while still
delivering the *expiry* signal the app needs to prune now-expired docs (the edge case from #433 —
otherwise an expired doc is orphaned, still visible, on the device).

A future migration off Socket.io to Server-Sent Events will need its own room/routing primitive, so
the live-update design here is also meant to seed that work rather than be throwaway.

## Decision

Introduce a new `AclPermission.CmsView` as the general CMS view gate, assignable on every
CMS-managed doc type. `View` stays the app/public gate (published only); `CmsView` gates all
CMS-scoped (`cms: true`) reads/sync, including drafts/scheduled/expired Content. The permission
graph, AccessMap, and CMS group-editor UI are data-driven, so the value flows through automatically.

1. **`cms` flag → permission.** `/query` and `/fts` select `cms ? CmsView : View` at the single
   `accessMapToGroups` call site (the `permissionCheckTypes` switch already resolves the right doc
   types). `cms: true` with no `CmsView` on any requested group → **403** (the same fail-closed
   behaviour as a missing `View`); it does not silently fall back to published-only.

2. **Socket.io base vs `-cms` rooms.** The AccessMap is per-user (a CMS user holds both `View` and
   `CmsView`), so the server can't tell an app connection from a CMS one — the client declares its
   mode in the `joinSocketGroups` handshake (`cms: true | false`, derived from `config.cms`). App
   connections join base `${docType}-${group}` rooms via `View`; CMS connections join
   `${docType}-${group}-cms` rooms via `CmsView`, and **only** those. On update, `-cms` rooms get
   the full doc for every status (restoring live CMS draft/expired collaboration); base rooms get
   published-and-live + non-Content full, expired Content stripped, and drafts not at all.

3. **Data minimization (`stripExpiredContent`).** A non-CMS client receives an expired Content doc
   only to prune it, never to display it. A single projection (`util/stripExpiredContent.ts`) reduces
   it to an identity/grouping/status/sync-cursor stub — no body/SEO/media/FTS — applied both in the
   `/query` response (non-`cms`) and the Socket.io base-room emit. The stub keeps `expiryDate`/
   `status` so the app's `deleteExpired()` prunes it (preserving #433); unpublish is handled by the
   existing app-only `DeleteReason.StatusChange` DeleteCmd.

4. **Migration / grants.** CmsView is **not** auto-granted broadly (it must stay a real, narrowable
   permission). Schema upgrade `v19` grants it only to the standard actor groups:
   `group-super-admins` gets direct View + CmsView ACL rows on every target group/doc type already
   present in the ACL graph (full CMS visibility without giving public/private users CmsView),
   `group-public-users` gets CmsView on AuthProvider only (so the CMS login screen reads the
   providers for any visitor), and `group-public-editors` / `group-private-editors` get CmsView on
   Post/Tag/Language/Redirect/Storage/Group. The upgrade runs at boot before traffic, is idempotent,
   and a one-time client recovery (`groupSyncListReset_v2`) re-fetches groups for clients whose sync
   block was left stuck during the rollout.

## Considered and not chosen

- **Unify status-change cleanup under stripped stubs** (deliver a stripped stub for *both* drafts and
  expired, have the shared lib delete-on-ingest without persisting it, and retire the
  `StatusChange` DeleteCmd). Cleaner long-term, but it changes the **core sync/cleanup protocol**
  (DeleteCmd lifecycle + shared-lib ingest semantics) every client depends on — a higher-blast-radius
  change than this additive permission work. Deferred: #160 keeps the two-mechanism split
  (StatusChange DeleteCmd for unpublish + strip for expired); `stripExpiredContent()` leaves the door
  open if it is revisited.

## Consequences

- Drafts/expired Content are now reachable only with `CmsView`; the app (View) never receives drafts,
  and expired Content reaches it only as a body-less prune stub.
- A new per-connection `cms` flag on the socket handshake (`ClientDataReq.cms`, sourced from the
  shared `config.cms`) spans api + the shared socket client; an absent/false flag keeps a client on
  base (View) rooms, so older clients are never routed to `-cms` rooms.
- The base/`-cms` room split is the routing primitive the SSE migration is expected to reuse.
- Backwards compatibility: governed by ADR 0005. The expired stub keeps `status`/`expiryDate`, so an
  older client without delete-on-ingest still hides it via its read filter (it just lingers as a
  hidden stub until pruned) — degrades safely.
