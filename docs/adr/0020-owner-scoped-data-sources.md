# 20. Owner-scoped data sources for user activity

Date: 2026-11-17

## Status

Accepted. The shared client foundation is implemented; the API and application
integration are delivered separately.

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
will mirror that DTO independently; its shared-dataset `DocType` enum must not gain
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
- The server endpoints, provisioning, owner validation and application lifecycle
  remain follow-up work; the shared foundation alone does not enable account sync.
- Different identity providers produce separate accounts until account linking exists.
- Live owner updates, quotas and server tombstone cleanup are later extensions.
