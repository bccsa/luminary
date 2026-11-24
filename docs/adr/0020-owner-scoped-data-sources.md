# 20. Owner-scoped data sources for user activity

Date: 2026-11-17

## Status

Accepted. The shared client foundation, application integration and API source are implemented.
Transport is enabled through configuration, database provisioning and capability advertisement.

## Context

User activity must follow a signed-in user across devices without entering the
shared dataset's group permissions, socket rooms or content sync cursor. Existing
clients and servers must continue to work during staged deployment (ADR 0005).

## Decision

Reuse the batch sync engine and outbound change-request queue against an explicit
source object. Each source owns a named local database and a sync cursor. A source
pull takes the single-column batch path, omits the `memberOf` selector, and does not
change the default source's `syncActive` indicator. HybridQuery and default live
sync retain their existing contracts.

The wire contract adds optional `dataSource` to `/changerequest`; omitting it selects
the shared dataset. User reads use `/user/query`, while shared `/query` rejects named
sources. The API advertises supported source names in socket `clientConfig.dataSources`.
Clients must not send source requests until advertised: an older API can reject an
unfamiliar document as a final acknowledgement and cause the queue to discard an
otherwise valid edit. Source configuration supplies its read endpoint through `queryPath`.

Both query controllers share validation, account rate limits and cost reporting through
`QueryRequestService`. User reads and writes live in `UserQueryService` and
`UserChangeRequestService`; `/changerequest` dispatches after common request parsing.
The shared change-request service has no dependency on user-data processing.

User activity uses the wire name `user`. Its target local database is
`luminary-user-db`, with documents, outbound changes and cursor stored together.
`UserActivityDto` is a discriminated union with separate viewed, liked and highlighted DTOs.
A dedicated `UserActivityType` enum supplies `type`; there is no second `activityType` field.
The common base reuses minimal document identity without shared group metadata. The API
mirrors these types; its shared-dataset `DocType` enum must not gain activity types.
The source syncs each type with its own cursor, using `syncList` on the device.

Activity ids are UUID v5 values with namespace `94bcbde6-4392-5f66-8900-7d7aabc6a7a9`.
The name is the JSON encoding of `[type, parentId]` for likes/views, or
`[type, contentId, start, end]` for highlights. Color and quotation edits preserve identity.
Highlights use a root `range`; tombstones preserve offsets but remove color and quoted text.
Reference ids still accept existing non-UUID content identifiers.

The app's `migrate.ts` moves existing activity from the main local activity table into
the source database before transport starts. The intermediate source formats introduced
within this feature never shipped and need no compatibility adapter or format migration.
Server initialization installs indexes without scanning or rewriting stored activity.

The server stores activity in an ops-provisioned, partitioned CouchDB database.
The owner partition key is
`HMAC-SHA256(USER_DATA_ID_SECRET, iss + "\n" + sub)`, in hex, using verified token
claims. Stored ids are `<ownerKey>:<clientDocId>`. The API prefixes ids on writes,
queries only the caller's partition, and strips the prefix on reads. The owner key
is never exposed to clients. A local identity marker may separately associate
retained device data with the issuer and subject from its OIDC profile.

`AuthGuard` builds an immutable `request.authIdentity` in `auth/requestContext.ts`
after resolving credentials through the identity cache. Account extraction and bucket
selection use `auth/requestIdentity.ts`; `auth/ownerKey.ts` retains the persisted HMAC.
User-data services receive the authorized owner key rather than interpreting credentials.
Change-request, query and FTS paths consume the auth-resolved rate-limit key: shared User
id first, account hash second, IP for anonymous callers. Missing user-data configuration
does not prevent shared requests; user-data authorization returns 401 for an absent account
and 503 for missing owner configuration. Token refreshes and session identifiers do not
change owner partitions or account allowances. Session-token integration remains pending
until its auth resolver can supply the original account identity at this boundary.

`USER_DATA_ID_SECRET` is dedicated to identity derivation, separate from
`ENCRYPTION_KEY`. It must be backed up and not rotated. Losing or changing it
orphans the corresponding user data. The source is served and advertised only
when its configuration and partitioned database are available.

Database assets have explicit targets: `db/designDocs/content/` and
`db/seedingDocs/content/` belong to the shared database; `db/designDocs/user/` belongs to
the partitioned user database. Registries and loaders use the same paths, preserved in
build output. Content seeding uses the database supplied to each call; user activity has
no seeds. The user database service shares one initialization promise and connection per
Nest singleton. Request processing never initializes clients or scans asset directories.
Fresh revision reads and conflict retries remain necessary for ordering across API instances.

Each liked or viewed post has one deterministic document; each highlighted passage
has its own document. Undo writes a tombstone. The later `activityTimeUtc` wins per
document, with future timestamps capped at the server clock. The server assigns
`updatedTimeUtc`; upload time must not reorder the user's activity history.

Source cursor progress is persisted after every batch. Pulls wait for the outbound
queue to empty, and transactional incoming writes skip queued local edits. Queue
uploads can be paced; explicit pulls, flushes and foreground events restart a stalled
queue. An interrupted pull resumes from its own persisted cursor after reload.

## Consequences

- Named databases need separate schema-version metadata and upgrade handling.
- Activity uploads require both authentication and accepted privacy policy consent.
  Activity recording and the move to local source storage remain unconditional.
- Explicit sign-out flushes then clears local source data. Lost sessions retain it;
  a different owner clears it before transport resumes.
- The application initializes activity storage before mount and reconciles ownership
  after auth. Its store, highlight readers and activity lists share the same source.
- Server endpoints and owner validation use a dedicated partitioned database. Ops provisions
  it before configuring `DB_USERDATA_DATABASE` and `USER_DATA_ID_SECRET`. The API verifies the
  partitioned layout and installs its own design docs before advertising the source; failures
  leave it disabled. The client remains local and queued until that advertisement arrives.
- Invalid user activity receives a final rejected HTTP 200 ack. Unavailable storage remains
  an HTTP error so the queue retries. Stale activity returns the stripped stored copy; conflict
  retries compare activity times again. Source responses omit bookmarks, which may encode
  internal owner-prefixed ids.
- Different identity providers produce separate accounts until account linking exists.
- Live owner updates, quotas and server tombstone cleanup are later extensions.
