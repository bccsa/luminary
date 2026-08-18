# Encryption key service, on a generic sidecar substrate — design docs

Working design notes for [#1901 — encryption key service API endpoint](https://github.com/bccsa/luminary/issues/1901),
part of the HLS media epic [#1897](https://github.com/bccsa/luminary/issues/1897).

Branch base: `1878-api-cms-hls-media-data-model` (**not** `main`). Everything below is written
against the code as it exists on that branch — file references are accurate for it.

> Status: **proposal, not implemented.** These documents exist to be reviewed before any code is
> written. Each one is self-contained enough to hand to a fresh conversation as the brief for that
> step.
>
> Scope: **`api/` only.** The deliverable is the sidecar document type and its endpoint. Client
> integration (the app's video player, CMS changes beyond a DTO mirror) is out of scope and is
> described only where it pins down the API contract. The design deliberately avoids changes that
> would force front-end churn.

## The shape of the work

The ticket is the **encryption key service**. The **sidecar service** is the substrate built to
carry it — a generic, reusable mechanism rather than a one-off key table, so the next payload that
needs "permission-gated, never replicated, fetched one at a time" inherits it. Most of these
documents describe the substrate because that is where most of the code is; the key service itself
is deliberately thin on top of it.

[00](00-encryption-key-service.md) is the end-to-end view of the key service and the right place to
start. What follows here is the substrate.

## The idea in one paragraph

A **sidecar** is a small document that hangs off a Post or Tag, holds an arbitrary `data` payload,
and is *never* replicated to clients through sync, socket rooms, or `/query`. The parent carries
the sidecar's ID; the sidecar carries the parent's `memberOf` so the existing permission system can
gate it without a new concept. Clients that need the payload ask for it explicitly, one parent at a
time, over an authenticated `GET /sidecar` endpoint. The first (and currently only) consumer is the
HLS decryption key for the video player.

```
PostDto / TagDto                         SidecarDto
┌────────────────────────────┐          ┌────────────────────────────────┐
│ _id: "post-abc"            │          │ _id: "sidecar-post-abc-hlsKey" │
│ memberOf: ["group-1"]      │ ───────► │ type: "sidecar"                │
│ media: {                   │          │ parentId: "post-abc"           │
│   hlsUrl: "https://…"      │          │ parentType: "post"             │
│   hlsKey_id: "sidecar-…"   │          │ sidecarType: "hlsEncryptionKey"│
│ }                          │          │ memberOf: ["group-1"]  ← copy  │
└────────────────────────────┘          │ data: { maskedKeyHex: "…" }    │
                                        └────────────────────────────────┘
        ▲                                             ▲
        │ synced to app/CMS as normal                 │ never synced.
        │                                             │ GET /sidecar?parentId=post-abc
```

## Why not reuse `CryptoDto`?

`CryptoDto` (`api/src/dto/CryptoDto.ts`) is what the current branch already uses for the HLS key
(`processMediaDto.ts:23`). It encrypts at rest under the server-wide `ENCRYPTION_KEY` and has no
`memberOf`, so it cannot be permission-gated per group and its contents cannot be handed to a
client without the server decrypting first. It is the right tool for S3 credentials (server-only
secrets) and the wrong one for a payload whose whole purpose is to be delivered to authorised
clients. See [07-no-encryption-at-rest.md](07-no-encryption-at-rest.md).

## The documents

| # | Document | Task it covers |
|---|---|---|
| **00** | **[The encryption key service](00-encryption-key-service.md)** | **The deliverable, end to end — start here.** What the sidecar substrate is *for*, the key's full lifecycle from encoder to player, and the failure modes only visible across the whole chain |
| 01 | [Generic sidecar service](01-generic-sidecar-service.md) | Generic sidecar object with `memberOf` + `data`; how to enforce `data` types in TypeScript |
| 02 | [REST endpoint](02-sidecar-rest-endpoint.md) | Endpoint named `sidecar`; shape, status codes, module wiring |
| 03 | [Lifecycle & deletion](03-lifecycle-and-deletion.md) | Delete when the Post/Tag is deleted, and when the key field is cleared |
| 04 | [HLS key as a sidecar](04-hls-key-as-sidecar.md) | Keys are sidecars of a Post/Tag; the parent carries the sidecar ID |
| 05 | [`memberOf` replication](05-memberof-replication.md) | Replicate the parent's `memberOf` onto the sidecar |
| 06 | [Key masking](06-key-masking.md) | Mask keys the way `luminary-media-convert` does; stored masked |
| 07 | [No encryption at rest](07-no-encryption-at-rest.md) | Keys need not use `CryptoDto`; what happens to the existing crypto path |
| 08 | [Keeping sidecars out of `/query`](08-query-api-exclusion.md) | No bulk extraction — `/query`, `/fts`, sync, socket rooms, ACLs |
| 09 | [Authentication](09-authentication.md) | JWT today, session tokens later |
| 10 | [Retrieval by parent ID](10-retrieval-by-parent-id.md) | Lookup semantics from a ContentDto's `parentId` |

## Implementation order

Build the key service outward from the value it protects: mask first, then somewhere safe to put
it, then the write path, then its lifecycle, and the endpoint last. Each step leaves the system in
a coherent state, and no step ships a window in which a key is stored or served unprotected.

| Step | Docs | Deliverable | Why here |
|---|---|---|---|
| **1** ✅ | [06](06-key-masking.md) | `api/src/util/maskKey.ts` + shared test vector | **Done** — `api/src/util/maskKey.ts` + `.spec.ts` landed, with the shared test vector (`98ceb55553113bf2fdd5a74b3fa6e8d8`) cross-asserted in `cms/src/util/mediaEncoder.spec.ts`. No dependencies at all — pure functions, no DB, runnable by anyone. Nothing downstream can store a key correctly until this exists. |
| **2** ✅ | [01](01-generic-sidecar-service.md) + [05](05-memberof-replication.md) + [08](08-query-api-exclusion.md) | Doc type, service, `memberOf` replication, every exclusion | **One commit, not three.** Adding `DocType.Sidecar` to the enum is what makes the exclusions necessary — see the warning below. **Done** — substrate landed on branch `1901-encryption-key-service-api-endpoint` (enum + DTO mirror, `sidecar.service` + `hlsEncryptionKey`, memberOf replication, and every exclusion from 08). CouchDB-dependent suites still user-run. |
| **3** | [04](04-hls-key-as-sidecar.md) + [07](07-no-encryption-at-rest.md) | `processMedia` writes a masked sidecar; the crypto path is deleted | These are the *same edit* to the same handful of lines. First point of real product value: keys are now stored correctly. |
| **4** | [03](03-lifecycle-and-deletion.md) | Deletion on parent delete and on key removal | Immediately after step 3, because step 3 is when real keys start existing and orphaning them becomes a live bug rather than a hypothetical one. |
| **5** | [02](02-sidecar-rest-endpoint.md) + [09](09-authentication.md) + [10](10-retrieval-by-parent-id.md) | `GET /sidecar` | Last. It is the only externally reachable surface, and building it once real keys exist means its tests round-trip through the actual write path instead of hand-built fixtures. |

PR split: **PR 1** = steps 1–2 (masking + substrate, no consumer), **PR 2** = steps 3–4 (HLS key
cutover + lifecycle), **PR 3** = step 5 (the endpoint).

### Why not the obvious order

An earlier draft of this document proposed `01 → 05 → 08 → 02 → 09 → 10 → 06 → 04 → 07 → 03`:
substrate, then read endpoint, then the key. It is recorded here because each thing wrong with it
is a thing worth not re-deriving.

- **Masking landed 7th, after the endpoint that serves masked data.** Between the endpoint and the
  masking there would be a period where the design stores and serves whatever is in `data` — i.e.
  plaintext keys. Masking has no prerequisites; there is no reason for it to be late.
- **The read endpoint was built before anything could write a sidecar.** Its tests would have to
  hand-construct documents, and [02](02-sidecar-rest-endpoint.md) already has to forward-reference
  [06](06-key-masking.md) to explain why `sidecarId` is in the response body. That forward
  reference is the ordering telling you it is inverted.
- **04 and 07 were separate steps.** Replacing `storeCryptoData` with a sidecar write *is*
  retiring the crypto path — one edit. Splitting it means writing it twice or shipping a state
  where both paths exist.
- **Deletion was last "because it depends on the final ID scheme"** — but the ID scheme is decided
  in 01, the first item, so the rationale does not hold. Deleting a key when its parent dies is a
  security requirement, not a finishing touch.

> **Step 2 must be one commit.** Today an unknown `doc.type` is rejected by
> `validateChangeRequest`'s `Object.values(DocType).includes(...)` check. The moment `sidecar` is
> a member of that enum, the check passes and the type is only stopped further down. Landing the
> enum member without the exclusions in [08](08-query-api-exclusion.md) — in particular the
> explicit change-request deny — opens a window in which a client can forge a sidecar document.

## Cross-cutting things that must not be forgotten

These are the seams `CLAUDE.md` warns about, applied to this feature:

- **Adding `DocType.Sidecar` is the riskiest single line in this feature.** It converts
  "unrecognised type" into "recognised type" everywhere the enum is consulted, and several of this
  design's guarantees currently rest on non-recognition. Read
  [08](08-query-api-exclusion.md#the-change-request-path-needs-an-explicit-deny) before adding it.
- **DTO mirror** — `api/src/dto/SidecarDto.ts` and `shared/src/types/dto.ts` must agree.
  Whether `DocType.Sidecar` should also be mirrored into `shared/src/types/enum.ts` is a genuine
  question, not a formality:
  - *Against:* clients never handle this document. A member in the client enum is an invitation for
    someone to register it in a `syncList`, and the mirror convention exists for documents clients
    actually receive.
  - *For:* `getAccessibleGroups` returns `Record<DocType, Uuid[]>`, so `app/src/sync.spec.ts:50`
    and `cms/src/sync.spec.ts:55` build exhaustive fixtures over it and **will fail to type-check**
    until updated — which forces the omission to be a conscious decision rather than an oversight.

  Recommendation: mirror it, and put a comment on the shared enum member saying that no client may
  ever sync or query this type. Do not let it land silently either way.
- **`shared` rebuild** — a type change in `shared` needs `npm run build` in `shared/` before
  `app`/`cms` type-checks see it (`/rebuild-shared`).
- **Schema upgrade** — **not needed.** 1878 has not been deployed, so no `hlsKey_id` crypto docs
  exist in any real database and the crypto path is deleted rather than migrated
  ([07](07-no-encryption-at-rest.md)). Local dev databases may hold junk from testing; not worth
  automating.
- **ADR** — this introduces a new class of non-replicated, permission-gated document. Worth an ADR
  (next free number is 0018) once the shape is agreed. See
  [08](08-query-api-exclusion.md) for the security argument it would record.

## Decisions taken (review round 1)

All five open questions are now answered. The documents below have been updated to reflect them;
this list is the record of what was decided and why it matters.

1. **1878 has not shipped anywhere.** No schema upgrade, no migration. The crypto path for HLS keys
   is simply deleted. (07)
2. **A key read requires `View` on the parent's groups *and* an available parent.** Draft, scheduled
   and expired parents are refused — a caller who cannot yet (or can no longer) see the content must
   not be able to fetch its key. This is more than the obvious permission check and is designed out
   in [02](02-sidecar-rest-endpoint.md#availability-check). (02, 10)
3. **Deterministic sidecar IDs.** `sidecar-<parentId>-<sidecarType>`. No design doc, no index,
   primary-key reads and deletes throughout. (01, 03)
4. **Front-end work is out of scope.** The CMS does not read keys back and no CMS-scoped path is
   being built. Client integration is described only as far as needed to pin the API contract; the
   design also now avoids gratuitous client churn (see [04](04-hls-key-as-sidecar.md) on keeping the
   `hlsKey_id` field name). (04, 06, 10)
5. **The mask is derived, not stored.** Seed is the sidecar `_id`, which the client already holds
   from the response. No `maskSeed` field. (06)

## Decisions taken (review round 2)

6. **Keys are unique per video.** A leaked key costs exactly one collection, not the library. This
   confirms rather than changes the design — one sidecar per `(parent, type)` already gives one key
   per collection, and it is why the absence of a batch parameter and a listing endpoint
   ([10](10-retrieval-by-parent-id.md)) is load-bearing: extracting the library means *N*
   individually authorised requests. That in turn promotes rate limiting from a footnote to a
   requirement ([02](02-sidecar-rest-endpoint.md#rate-limiting)).
7. **Anonymous callers are allowed, gated by the normal permission check** (reading A in
   [09](09-authentication.md)). No `AuthenticatedGuard` is built. **Confirm before implementing
   step 5** — the ticket's wording reads more like reading B, and the consequence of A is that
   default-group configuration becomes security-relevant.

### Still open

- **The consumer does not exist yet, and the payload shape is unverified.** See the risk section
  below. This is the largest open question against the contract in
  [02](02-sidecar-rest-endpoint.md).
- **Where the availability check draws the line for `publishDate`.** `/query` and `/fts` disagree
  today: `/fts` refuses scheduled content (`publishDate > now`), `/query`'s non-CMS path does not
  filter on `publishDate` at all. The sidecar endpoint follows `/fts` (stricter). Noted in
  [02](02-sidecar-rest-endpoint.md#availability-check) in case that divergence is itself a bug worth
  a separate ticket.
- **Audit logging.** Nothing in this design records who fetched which key when, and server-written
  sidecars have no meaningful `updatedBy`. For a key service that is usually the first thing wanted
  after an incident. Either scope it or record it as a deliberate non-goal in the ADR.
- **Offline playback of encrypted media.** Persisting keys client-side is the only way an
  offline-first app plays encrypted downloads offline, and it partly undoes the no-bulk-extraction
  property. Out of scope here; flagged in [10](10-retrieval-by-parent-id.md).

## Risk: this endpoint has no working consumer yet

None of the documents below mentioned this, and it is the biggest threat to the contract being
right. From `docs/guides/media-encoder-integration.md`:

- **Encryption is currently switched off.** Every encoder session is created with
  `encryption: { required: false }` (`cms/src/composables/useMediaEncoder.ts`), so no new
  collection is encrypted at all.
- **The current player cannot read an encrypted collection.** Playlists are LMCENC-encrypted and
  `#EXT-X-KEY` names a `luminary://key` sentinel that a browser cannot fetch. Decryption has to
  happen before hls.js sees the bytes.
- **The thing that would do that decryption is unavailable.** `player-web` / `player-core` / `hls`
  are `private: true` and published to no registry; open-sourcing them is a prerequisite and the
  integration is not scheduled.

Two consequences for this work:

1. The endpoint will sit unused for some time. That is an argument for building it correctly and
   cheaply, not for not building it — but it does mean **no end-to-end verification is possible**
   within this ticket, and the round-trip test in [10](10-retrieval-by-parent-id.md) is the closest
   substitute.
2. **It is unconfirmed that one 16-byte AES-128 key is the whole secret.** The guide describes
   LMCENC playlist encryption as a mechanism *separate* from segment AES-128, and this design
   assumes a single `maskedKeyHex` suffices. Confirm with whoever owns `player-core` before
   freezing the `data` shape — `data: unknown` on the generic service means a second field is a
   contained change ([01](01-generic-sidecar-service.md)), but the endpoint's response body and the
   `HlsEncryptionKeyData` guard would both need revising.
