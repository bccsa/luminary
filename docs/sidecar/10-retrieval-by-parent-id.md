# 10 — Retrieval by parent ID

> **Task:** Sidecar API: supply the Post/Tag ID (`parentId` of the `ContentDto`) to retrieve the
> key.

## Why `parentId` and not the sidecar ID

The client that needs the key is the video player, and what it holds is a **Content document**, not
a Post or Tag. `ContentDto` carries `parentId`, `parentType`, and — after
`processPostTagDto.ts:122` copies it down — `parentMedia` with the `hlsUrl`. So `parentId` is
already in the player's hand at the moment it needs the key; nothing else is.

Addressing by parent also lines the request up with the permission check, which is *about* the
parent ([02](02-sidecar-rest-endpoint.md)): the endpoint resolves the parent, checks `View` on its
`memberOf`, and only then looks up the sidecar. Addressing by sidecar ID would mean loading the
sidecar first and permission-checking on its copied `memberOf` — trusting the replicated value
rather than the authoritative one ([05](05-memberof-replication.md)).

## The lookup

With deterministic IDs ([01](01-generic-sidecar-service.md)) the whole path is primary-key reads —
no Mango query, no index, no eventual-consistency window:

```
parentId + sidecarType
   → db.getDoc(parentId)                                  → permission check
   → db.getDoc(`sidecar-${parentId}-${sidecarType}`)      → payload
```

Plus one view read for the availability check ([02](02-sidecar-rest-endpoint.md#availability-check)),
so three reads per request. All are `_all_docs`- or view-class reads and cheap enough for a path hit
once per video open; if profiling ever says otherwise, the parent read is the one to cache (it is
already in CouchDB's cache from sync traffic).

## What the contract assumes of a client

Front-end work is **out of scope** — no app or CMS code is written in this ticket. But the endpoint's
shape only makes sense against an intended consumer, so recording the assumptions keeps a later
implementer honest and stops the API from being designed into a corner:

- The caller holds a **Content document** and takes `parentId` from it. It does not need to fetch the
  Post/Tag first.
- The caller knows whether a key exists **before asking**, from `parentMedia.hlsKey_id`
  ([04](04-hls-key-as-sidecar.md)). Unencrypted collections cost zero requests. This is why the
  stored reference is kept even though the ID is derivable.
- The caller **unmasks** the returned `maskedKeyHex` using the returned `sidecarId` as the seed
  ([06](06-key-masking.md)). The API never returns a usable key directly.
- The caller distinguishes the failure modes: **404 → no key, play unencrypted** (an answer, not a
  failure — the house style set by `fetchEncoderSessionKey` in `cms/src/util/mediaEncoder.ts:169`);
  **401 → refresh the token and retry once** ([09](09-authentication.md)); **403 → unavailable, do
  not retry.**

### Deliberately unresolved: offline playback

Persisting fetched keys in IndexedDB is the only way an offline-first app plays downloaded encrypted
media while offline. It also puts decryption keys in browser storage indefinitely, outside the sync
engine's eviction logic — a permission change would not remove them, which partly undoes the
no-bulk-extraction property on the client side.

Nothing in this API forecloses either choice, so it does not need deciding now. Raising it because
it is easy to stumble into by accident later: it may simply be that encrypted media is never
`alwaysOffline` content. Worth its own ticket and probably an ADR when the player is built.

### No CMS-scoped path

The CMS does not read keys back — `EditContentVideo.vue:57` only checks
`hasStoredKey = Boolean(parent.value?.media?.hlsKey_id)` and disables the input
(`EditContentVideo.spec.ts:105`); the editor is told a key is stored, never shown it. So no
`cms=true` / `CmsView` variant is being built. If a "show/copy the stored key" feature ever appears,
[02](02-sidecar-rest-endpoint.md) records the shape it should take.

## `sidecarType` in the request

Required, not defaulted. Defaulting to `hlsEncryptionKey` would make the endpoint read as
"the key endpoint" and the first non-key sidecar would break the contract. An explicit parameter
keeps the endpoint honestly generic and costs the client one query-string field.

Validate it against `Object.values(SidecarType)` and 400 on anything else — an unknown value must
not fall through to a `getDoc` on a constructed ID.

## Not supported, deliberately

- **No `parentIds` array.** See [08](08-query-api-exclusion.md) — batching is the bulk-extraction
  primitive we are specifically avoiding.
- **No "list sidecars for this parent".** The client knows what it wants; an enumeration endpoint
  reintroduces discovery.
- **No lookup by Content ID.** The player has `parentId`; resolving Content → parent server-side
  would add a read and a second addressing scheme for no gain.

## Files to touch

| File | Change |
|---|---|
| `api/src/endpoints/sidecar.controller.ts` | parameter handling + validation (covered in 02) |
| `api/docs/rest-api/README.md` | document the contract, including the client assumptions above |

Nothing in `app/`, `cms/` or `shared/`.

## Tests

- `sidecarType` missing or unknown → 400, with no `getDoc` on a constructed ID.
- A `parentId` that names a Content document rather than a Post/Tag → 404, not a partial answer.
- A `parentId` that names a Post whose sidecar exists → the response `sidecarId` matches
  `sidecar-<parentId>-<sidecarType>` exactly. This is the assertion that pins the mask seed: the
  client derives its mask from this value, so a change to the ID scheme that slipped through
  silently would break decryption everywhere at once.
- Round-trip: a key written through a change request comes back out of `/sidecar` and unmasks (with
  the returned `sidecarId`) to the original. Worth having as one API-level test even though the
  masking has its own unit tests — it is the only thing that proves write and read agree on the seed.

## Related

[02 REST endpoint](02-sidecar-rest-endpoint.md) · [06 key masking](06-key-masking.md) ·
[09 authentication](09-authentication.md) · [04 HLS key as a sidecar](04-hls-key-as-sidecar.md)
