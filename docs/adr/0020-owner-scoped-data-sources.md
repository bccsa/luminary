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

The wire contract adds optional `dataSource` to `/query` and `/changerequest`.
Omitting it selects the shared dataset. The API advertises supported source names
in socket `clientConfig.dataSources`. Clients must not send source requests until
advertised: an older API can reject an unfamiliar document as a final acknowledgement
and cause the queue to discard an otherwise valid edit.

User activity uses the wire name `user`. Its target local database is
`luminary-user-db`, with documents, outbound changes and cursor stored together.
The shared `UserActivityDto` uses `type: "userActivity"`, `activityType`, an
activity timestamp, and the server's `updatedTimeUtc` cursor timestamp. The API
mirrors that DTO independently; its shared-dataset `DocType` enum must not gain
`UserActivity`.

The server stores activity in an ops-provisioned, partitioned CouchDB database.
The owner partition key is
`HMAC-SHA256(USER_DATA_ID_SECRET, iss + "\n" + sub)`, in hex, using verified token
claims. Stored ids are `<ownerKey>:<clientDocId>`. The API prefixes ids on writes,
queries only the caller's partition, and strips the prefix on reads. The owner key
is never exposed to clients. A local identity marker may separately associate
retained device data with the issuer and subject from its OIDC profile.

`USER_DATA_ID_SECRET` is dedicated to identity derivation, separate from
`ENCRYPTION_KEY`. It must be backed up and not rotated. Losing or changing it
orphans the corresponding user data. The source is served and advertised only
when its configuration and partitioned database are available.

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
