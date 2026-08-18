# 00 — The encryption key service

> **This is the deliverable.** [#1901](https://github.com/bccsa/luminary/issues/1901) asks for an
> encryption key service API endpoint. The sidecar service (documents 01–03, 05, 08) is the
> *substrate* built to carry it cleanly and to be reusable for the next thing that needs the same
> shape. This document is the end-to-end view of the key service itself, so it does not disappear
> into the generic machinery.

Read this first. Documents 01–10 are the implementation detail behind it.

## What it does, in one sentence

An HLS collection's AES-128 decryption key is captured when the collection is published, stored
masked in a sidecar document that no client can sync or query, and handed to authorised players one
key per request over `GET /sidecar`.

## End-to-end lifecycle of a key

```
┌── luminary-media-convert (editor's machine) ───────────────────────────────┐
│  encodes the collection, uploads segments straight to the S3 bucket        │
│  holds the AES-128 key for the session                                     │
│  serves it masked:  mask = SHA-256(sessionId)[0..15]                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │  GET /api/sessions/:id/key  → maskedKeyHex
                                ▼
┌── cms/ ────────────────────────────────────────────────────────────────────┐
│  fetchEncoderSessionKey() unmasks with sessionId          mediaEncoder.ts  │
│  onMediaReady({ hlsUrl, hlsKey })                      useMediaEncoder.ts  │
│  (or an editor types a key by hand)                    EditContentVideo    │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │  POST /changerequest   { media: { hlsUrl, hlsKey } }
                                ▼
┌── api/  ← THE WORK IN THIS TICKET ─────────────────────────────────────────┐
│  processMedia()          masks under the sidecar _id, writes the sidecar   │
│                          drops media.hlsKey before the doc is stored  (04) │
│  sidecar doc             memberOf copied from the parent              (05) │
│                          excluded from /query, /fts, sync, rooms      (08) │
│  GET /sidecar            JWT required, View on parent, parent must be      │
│                          currently available                    (02,09,10) │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │  { sidecarId, data: { maskedKeyHex } }
                                ▼
┌── app/ (not in this ticket, and not yet possible — see below) ─────────────┐
│  unmask with sidecarId → feed the key to the HLS player                    │
└────────────────────────────────────────────────────────────────────────────┘
```

> **The bottom box does not exist and cannot be built yet.** Per
> `docs/guides/media-encoder-integration.md`: encoder sessions are currently created with
> `encryption: { required: false }`, so nothing is being encrypted; the current video.js / hls.js
> player cannot read an encrypted collection at all (LMCENC-encrypted playlists, and an
> `#EXT-X-KEY` naming a `luminary://key` sentinel a browser cannot fetch); and the component that
> would fix that — `player-core` — is `private: true`, published to no registry, and blocked on
> being open-sourced.
>
> This does not invalidate the work: the API side is a prerequisite either way, and building it now
> is cheap. But two things follow, and both are easy to forget. **No end-to-end verification is
> possible in this ticket** — the closest available substitute is the write→read round-trip test in
> [10](10-retrieval-by-parent-id.md). And **the payload shape is unconfirmed**: that guide describes
> LMCENC playlist encryption as a mechanism *separate* from segment AES-128, while this design
> assumes one 16-byte key is the whole secret. Confirm with whoever owns `player-core` before
> treating `data: { maskedKeyHex }` as settled.

The parent Post/Tag keeps `media.hlsKey_id` pointing at the sidecar, and that reference rides along
to every Content child as `parentMedia.hlsKey_id` — which is how a player knows a key exists before
asking for one ([04](04-hls-key-as-sidecar.md)).

## What is key-specific, and what is substrate

This split is the point of the branch, so it is worth seeing the sizes side by side.

**The key service — everything that knows an HLS key exists:**

| File | Role |
|---|---|
| `api/src/sidecar/hlsEncryptionKey.ts` | `HlsEncryptionKeyData`, its guard, `upsertHlsKeySidecar` / `getHlsKeySidecar` |
| `api/src/util/maskKey.ts` | mask/unmask (self-inverse XOR) |
| `api/src/changeRequests/documentProcessing/processMediaDto.ts` | capture on write, drop the plaintext |
| `api/src/dto/MediaDto.ts` | `hlsKey_id` / `hlsKey` — doc comment change only |

**The sidecar substrate — knows nothing about keys:**

| File | Role |
|---|---|
| `api/src/dto/SidecarDto.ts` | the document type |
| `api/src/sidecar/sidecar.service.ts` | deterministic IDs, upsert/get/delete, `memberOf` replication |
| `api/src/endpoints/sidecar.controller.ts` | the endpoint, auth, permission + availability gating |
| `api/src/enums.ts`, `query.service.ts`, `socketio.ts`, `db.service.ts` | registration and exclusion |

The key service is four files, and three of them are small. That thinness is the deliverable
working as intended: the next payload that needs "permission-gated, never replicated, fetched one
at a time" adds a `SidecarType` member and one module, and inherits the endpoint, the exclusions
and the lifecycle for free.

## The security argument, end to end

Each layer is detailed elsewhere; this is the chain in one place, because no single document shows
it whole:

1. The key never rests in plaintext — masked before write, served masked ([06](06-key-masking.md)).
2. It never rests on the Post/Tag either — `hlsKey` is `toClassOnly` and deleted in a `finally`
   block whether or not storage succeeded ([04](04-hls-key-as-sidecar.md)).
3. It cannot be synced, queried, searched, or received over a socket ([08](08-query-api-exclusion.md)).
4. It cannot be created, modified or deleted by a client — the change-request path denies the type
   explicitly ([08](08-query-api-exclusion.md#the-change-request-path-needs-an-explicit-deny)).
   Note this is a *deny*, not merely the absence of a handler: adding `DocType.Sidecar` to the enum
   removes the check that would otherwise reject it.
5. Reading requires `View` on the parent's groups and a parent that is currently published and live
   ([02](02-sidecar-rest-endpoint.md#availability-check)). Whether it also requires a
   non-anonymous identity is [09](09-authentication.md)'s open decision — currently **no**.
6. One key per request. No batch parameter, no listing ([10](10-retrieval-by-parent-id.md)) — and a
   per-identity rate limit, without which that only means bulk extraction takes a loop
   ([02](02-sidecar-rest-endpoint.md#rate-limiting)).
7. The response is `Cache-Control: no-store`, so it does not settle into a service-worker cache
   ([02](02-sidecar-rest-endpoint.md#response-headers)).
8. Deleted with its parent, and when the editor clears it ([03](03-lifecycle-and-deletion.md)).

What this does **not** defend against, stated plainly so nobody over-reads it: an authorised viewer
redistributing the key. Nothing in an offline-first architecture can. See
[07](07-no-encryption-at-rest.md).

## Failure modes worth designing for

These only become visible when you look at the whole chain, which is why they are here rather than
in the per-task documents.

| What goes wrong | Result | Handling |
|---|---|---|
| Encoder key fetch fails in the CMS | `onMediaReady` fires with `hlsKey: undefined` (`useMediaEncoder.ts` catches to `undefined`), so an **encrypted** collection is saved with no key and plays as if unencrypted — failing at the player | Not an API problem, but the API can help: `processMedia` cannot tell an unencrypted collection from a lost key. Worth raising as a CMS ticket — the encoder knows whether the session was encrypted, so "encrypted session but no key" is detectable there. |
| **Sidecar write fails on the API** | Today: the error becomes a *warning*, the change request succeeds, and the Post saves with an `hlsUrl` and no `hlsKey_id`. The plaintext key existed only for the duration of that request and `processMedia`'s `finally` has already deleted it — **the key is gone and the collection is unrecoverable without re-encoding** | The most serious failure mode in the chain and the one most easily missed, because it presents as success. `processPostTagDto` must rethrow rather than collect a warning for the key specifically ([04](04-hls-key-as-sidecar.md#a-failed-key-store-must-fail-the-change-request)) |
| Editor types a wrong key by hand | Segments fail to decrypt at playback, long after saving | The API validates hex shape only ([06](06-key-masking.md)); it cannot verify a key against segments it never sees. Accepted. |
| Sidecar deleted but `hlsKey_id` still on the parent | `/sidecar` 404s; the player treats it as unencrypted and fails | Both deletion triggers clear the reference and the document in the same change request ([03](03-lifecycle-and-deletion.md)). Worth an assertion in tests that the two never diverge. |
| Parent goes to draft, or expires, after a client fetched the key | The client still holds the key for as long as it caches it | The availability check gates *new* fetches only ([02](02-sidecar-rest-endpoint.md#availability-check)). Revoking an already-delivered key is not achievable; this is the same property as any published content the app has already synced. |
| Parent write fails after the sidecar was written | Orphaned sidecar | Inert — `/sidecar` resolves the parent first and 404s ([03](03-lifecycle-and-deletion.md)). |
| `ENCRYPTION_KEY` rotated or lost | **Nothing** — keys no longer depend on it | This is the concrete win from [07](07-no-encryption-at-rest.md). Under the current crypto-doc approach, losing it would make every encrypted video permanently unplayable. |

## Where to go next

[README](README.md) has the implementation order and the decisions log. If you are implementing,
follow that order rather than the document numbering — the numbers are the shape of the design, not
the sequence of the work. It starts at [06](06-key-masking.md) (masking, no dependencies), then the
substrate as one commit, then the write path, then deletion, then the endpoint last.
