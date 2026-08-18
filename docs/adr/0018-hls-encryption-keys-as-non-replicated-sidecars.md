# 18. HLS encryption keys as non-replicated, permission-gated sidecars (masked, not encrypted at rest)

Date: 2026-08-18

## Status

Accepted

## Context

The HLS media epic (#1897) needs a place to store the AES-128 decryption key for an encrypted
video collection so that the app player can fetch it at playback time, but only for collections
the caller is entitled to watch.

The branch already had a storage mechanism for small secrets — `CryptoDto`
(`api/src/dto/CryptoDto.ts`) + `storeCryptoData`/`retrieveCryptoData`
(`api/src/util/encryption.ts`), which AES-256-CBC-encrypts a value under a key derived by `scrypt`
from the server-wide `ENCRYPTION_KEY` env var and writes a `CryptoDto` with a random UUID. That is
what `processMedia` used for the HLS key (`processMediaDto.ts`).

`CryptoDto` is the right tool for **server-only** secrets — specifically S3 credentials
(`StorageDto.credential_id`, decrypted server-side in `s3.service.ts` and
`encoderConfig.controller.ts`). Its properties are exactly wrong for a key whose whole purpose is to
be delivered to an authorised client:

| `CryptoDto` property | Effect on an HLS key |
|---|---|
| No `memberOf` | Cannot be permission-gated per group; nothing to check `verifyAccess` against. |
| Encrypted under one server-wide `ENCRYPTION_KEY` | Every read costs a decrypt, and the API must hold the plaintext to serve it. |
| Rotation not automated | `CLAUDE.md`: *"rotation is not yet automated — don't store anything irrecoverable."* A lost `ENCRYPTION_KEY` would make every encrypted video permanently unplayable, including for CMS editors who could otherwise re-enter the key. |
| Serving requires decrypt-then-respond | The plaintext key exists in API memory and in the response body on every request. |

The decisive row is the third. Encrypting at rest converts a *recoverable* problem (a key document
is lost → re-run the encoder or re-enter the key) into an *unrecoverable* one (the `ENCRYPTION_KEY`
is lost → the entire encrypted media library is dead). For a value that is handed to any authorised
client on request, that risk buys almost nothing: an attacker with raw CouchDB access — the only
threat encryption-at-rest would defend against here — could also read the `ENCRYPTION_KEY` from the
API's environment.

## Decision

Introduce a **sidecar** document class: a small document that hangs off a Post or Tag, holds an
arbitrary `data` payload, and is **never replicated to clients** through sync, socket rooms, `/query`,
or `/fts`. The parent carries the sidecar's ID (`MediaDto.hlsKey_id`); the sidecar carries the
parent's `memberOf` so the existing permission system gates it with no new concept.

Store HLS decryption keys as sidecars, **masked, not encrypted at rest.**

The protections on the key, in place of encryption at rest:

1. **Access control** — `GET /sidecar` checks `View` on the parent's `memberOf` and refuses draft /
   scheduled / expired parents (the endpoint lands in a later step).
2. **No bulk extraction** — sidecars are excluded from `/query`, `/fts`, sync, and socket rooms
   (`query.service.ts`, `aclValidation.ts`). One key per authorised request; there is no listing
   primitive. Extracting a library costs *N* individually authorised requests, which is why the
   absence of a batch/listing parameter is load-bearing and rate limiting is a requirement on the
   endpoint.
3. **Masking** — the key is XOR-masked with `SHA-256(sidecar._id)[0..15]` (`api/src/util/maskKey.ts`)
   so the raw AES key never appears verbatim in the document, a log line, a proxy cache, or a DB
   dump. This is **obscurity, not a secret**: anyone who can read the sidecar can derive the mask,
   because the seed (the sidecar `_id`) is public. It raises the cost of casual extraction; it is
   not DRM and does not defend against an authorised client redistributing the key — nothing in an
   offline-first architecture can.
4. **Transport** — TLS, same as every other endpoint.

The honest summary: *an HLS key is a value we hand to anyone allowed to watch the video.
Protecting it from those people is not achievable; protecting it from everyone else is what the
permission check and the absence of a bulk read path do.*

### Supporting decisions

- **Deterministic sidecar IDs** — `_id = sidecar-<parentId>-<sidecarType>` (`sidecar.service.ts`).
  No design doc, no index; primary-key reads and deletes throughout. The stored `hlsKey_id` field
  is kept (not derived client-side) because it is the existence flag that lets the player skip a
  404-ing request for every unencrypted collection, and it decouples the client from the ID scheme.
- **The mask seed is derived, not stored.** No `maskSeed` field — a seed stored next to the value
  it masks adds a field and no obscurity. The seed is the sidecar `_id`, which the client already
  holds from the endpoint response.
- **`CryptoDto` stays.** `CryptoDto`, `storeCryptoData`, `retrieveCryptoData`, and
  `util/encryption.ts` are **not** removed — they remain in use for S3 credentials. The `crypto` doc
  type also keeps its `/query` block; the sidecar exclusion was added **alongside** it.
- **No migration / schema upgrade.** 1878 (the branch that introduced the `hlsKey` crypto write)
  has not been deployed, so no real or staging database holds an HLS key as a crypto document. The
  `storeCryptoData` call in `processMedia` is deleted outright. Local dev databases may hold junk
  from manual testing; orphaned crypto docs there are inert and unreachable, not worth automating.

## Consequences

- A new class of non-replicated, permission-gated document exists. Other payloads that need
  "permission-gated, never replicated, fetched one at a time" can inherit the sidecar substrate
  rather than a one-off key table. A second `data` field on `HlsEncryptionKeyData` is a contained
  change if the LMCENC playlist key turns out to be a separate secret.
- One key per `(parent, type)` — a leaked key costs exactly one collection, not the library. This
  is why the endpoint has no batch parameter and no listing endpoint.
- `memberOf` is copied from the parent onto the sidecar, and re-stamped on every parent save
  (`syncSidecarMemberOf`). A sidecar `memberOf` change does **not** emit a `DeleteCmd`
  (`db.service.ts` `upsertDoc` excludes `DocType.Sidecar`) — sidecars are never replicated, so there
  is nothing to evict, and a `DeleteCmd` would leak key-group membership into `deleteCmd-*` rooms.
- **No audit logging** of who fetched which key when, and server-written sidecars have no
  meaningful `updatedBy` beyond the submitting editor. This is a deliberate non-goal for this
  ticket, flagged for a future incident-driven requirement.
- **Offline playback of encrypted media** is out of scope here. Persisting keys client-side is the
  only way an offline-first app plays encrypted downloads offline, and it partly undoes the
  no-bulk-extraction property. Noted in `docs/sidecar/10`.
- **No end-to-end verification yet.** The consumer (the app player's decryption layer) does not
  exist on this branch; encryption is currently switched off in the encoder. The endpoint will sit
  unused until that lands, which is an argument for building it correctly and cheaply — not for not
  building it. The round-trip tests substitute for end-to-end verification.

## Related

- `docs/sidecar/` — the design docs for the sidecar substrate and key service.
- ADR 0005 — backwards compatibility (the `apiVersion` gate).
- ADR 0013 — the `View`/`CmsView` permission distinction the sidecar access check reuses.