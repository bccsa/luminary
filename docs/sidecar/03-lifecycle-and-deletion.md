# 03 — Lifecycle and deletion

> **Task:** Delete the sidecar object when: 1. the Post/Tag is deleted; 2. the key field is deleted.

## What exists today

`processPostTagDto.ts:25` handles the parent's delete cascade:

```ts
if (doc.deleteReq) {
    const contentDocs = await db.getContentByParentId(doc._id);
    for (const contentDoc of contentDocs.docs) {
        contentDoc.deleteReq = true;
        await db.upsertDoc(contentDoc);
    }

    if (doc.imageData && prevDoc?.imageData) { … deleteImage … }

    // Media is an HLS collection written to the bucket by the encoder … Deleting the
    // document therefore leaves the collection in place …

    return warnings; // no need to process further
}
```

Two gaps in the current crypto-based implementation, both of which the sidecar work should close:

1. **Nothing deletes the key when the parent is deleted.** The `hlsKey_id` crypto doc outlives the
   Post forever.
2. **Nothing deletes the key when it is replaced or cleared.** `processMediaDto.ts:23`
   unconditionally calls `storeCryptoData` and overwrites `hlsKey_id` with a *new* doc ID — the old
   crypto doc is orphaned. `processMediaDto.spec.ts:45` asserts this behaviour
   (`expect(first.hlsKey_id).not.toBe(second.hlsKey_id)`), so it is deliberate today, not an
   accident, but it does not survive contact with a deletion requirement.

Deterministic sidecar IDs ([01](01-generic-sidecar-service.md)) make gap 2 mostly disappear: the
same parent+type always resolves to the same document, so a replacement key *overwrites* rather
than orphans. Deletion is then only needed for genuine removal.

## Trigger 1 — the Post/Tag is deleted

Add to the `doc.deleteReq` branch of `processPostTagDto`, before the early `return`:

```ts
// Sidecars are children of this document in every sense — nothing else references them
// and no client holds a copy, so they go with it. Hard delete, no DeleteCmd.
await deleteSidecarsForParent(db, doc._id);
```

`deleteSidecarsForParent` iterates `Object.values(SidecarType)` and calls `db.deleteDoc()` on each
deterministic ID; `deleteDoc` already no-ops cleanly on a missing document
(`db.service.ts:709`, "Document not found"). No index, no Mango find.

**Ordering:** put it before the `return`, after the Content cascade. If it throws, the parent
delete fails and is retried — better than a half-deleted parent with a live key. Alternatively
collect a warning like the image path does (`deleteImage` returns warnings rather than throwing).
Recommendation: **push a warning rather than throw**, matching `deleteImage`'s precedent — a
failure to delete a key must not block deleting the content it belongs to. A leaked key document
that is unreachable via `/query` ([08](08-query-api-exclusion.md)) and has no parent to authorise a
read against is inert.

That last point is worth stating explicitly because it is the safety net for every failure mode
here: **an orphaned sidecar is unreadable.** `/sidecar` resolves the parent first and 404s when it
is gone ([02](02-sidecar-rest-endpoint.md)), so an undeleted sidecar is dead weight in CouchDB, not
an exposure.

## Trigger 2 — the key field is deleted

"The key field is deleted" needs disambiguation, because there are three distinguishable edits in
the CMS (`cms/src/components/content/EditContentVideo.vue`):

| Editor action | Change request contains | Should the sidecar be deleted? |
|---|---|---|
| Clears the key input on a collection that had a key | `media` present, `media.hlsKey_id` cleared/absent, no `media.hlsKey` | **Yes** |
| Types a new key over an old one | `media.hlsKey` set | **No** — overwritten in place |
| Removes the whole media object (clears the HLS URL) | `media` absent from the Post/Tag | **Yes** |
| Saves an unrelated field | `media` unchanged, `hlsKey_id` still present | **No** |

The distinguishing signal in all four rows is: **`prevDoc` had a sidecar reference and `doc` does
not.**

### Where the check goes — not inside `processMedia`

An earlier draft put this condition inside `processMedia`, taking `prevMedia` as a new parameter.
**That cannot work**, and the doc's own table says why: `processPostTagDto.ts:100` calls
`processMedia` only from inside `if (doc.media)`. Row 3 of the table above — the editor removes the
whole media object — is exactly the case where `doc.media` is absent, so `processMedia` never runs
and the sidecar is never deleted. The one row that most obviously needs a deletion is the one that
placement cannot reach.

Put the check in `processPostTagDto` instead, outside the `if (doc.media)` block, where both
documents are unconditionally in scope:

```ts
// A key that was there and is no longer referenced has been removed by the editor —
// whether they cleared the key field or the whole media object. Outside the `if (doc.media)`
// block on purpose: removing the collection removes `doc.media` entirely, which is the case
// a check inside processMedia would never see.
if (
    prevDoc?.media?.hlsKey_id &&
    !doc.media?.hlsKey_id &&
    !doc.media?.hlsKey
) {
    await deleteSidecar(db, doc._id, SidecarType.HlsEncryptionKey);
}
```

Order it **after** the `if (doc.media)` media-processing block, so that a change request carrying
both a removal and a fresh key resolves to the write rather than the delete.

The `!doc.media?.hlsKey` clause matters for the same reason: a fresh key arriving in the same
change request means *replace*, not *delete*, and `processMedia` will have already recreated the
document at the same ID.

`processMedia` still needs a signature change ([04](04-hls-key-as-sidecar.md)) — it needs the
parent document for `memberOf` and the deterministic ID — but it does **not** need `prevMedia`.

**Watch out for the field-drop hazard.** `MediaDto.hlsKey` is declared
`@Expose({ toClassOnly: true })` (`api/src/dto/MediaDto.ts:29`) so it never reaches the stored
document — good. But `hlsKey_id` must be plainly `@Expose()`d, or `instanceToPlain` in
`db.upsertDoc` silently drops it on every write and the "reference disappeared" condition above
fires on *every save*, deleting keys at random. Add a test that saves an unrelated field on a Post
with a key and asserts the sidecar survives.

## What must *not* happen

- **No `DeleteCmd`.** Use `db.deleteDoc()`. Setting `deleteReq` routes through `insertDeleteCmd`
  (`db.service.ts:462`) and broadcasts a `deleteCmd` with `docType: "sidecar"` into
  `deleteCmd-${group}` rooms, telling clients to evict a document they never received.
- **No cascade from Content.** Sidecars hang off the Post/Tag, not off Content documents; deleting
  one translation must not touch the key.

## Files to touch

| File | Change |
|---|---|
| `api/src/changeRequests/documentProcessing/processPostTagDto.ts` | call `deleteSidecarsForParent` in the `deleteReq` branch; key-removal detection **outside** the `if (doc.media)` block |
| `api/src/changeRequests/documentProcessing/processMediaDto.ts` | signature change only (takes the parent doc) — removal detection lives in the caller |
| `api/src/changeRequests/documentProcessing/processMediaDto.spec.ts` | replace the "two saves → two crypto docs" assertion with "two saves → one sidecar, overwritten" |
| `api/src/changeRequests/documentProcessing/processPostTagDto.spec.ts` | cascade-delete coverage |

## Tests

CouchDB-backed → **user-run**.

- Deleting a Post with a key sidecar removes the sidecar document.
- Deleting a Post with no sidecar succeeds and warns nothing.
- Clearing the key on an existing Post removes the sidecar.
- **Removing the whole `media` object from a Post that had a key removes the sidecar.** This is the
  case the rejected placement could not reach; if it ever starts failing, someone has moved the
  check back inside `processMedia` or inside `if (doc.media)`.
- A change request that both removes `hlsKey_id` and supplies a new `hlsKey` leaves a sidecar
  holding the new key (the write wins over the delete).
- Saving a *new* key over an old one leaves exactly one sidecar, at the same `_id`, with the new
  payload.
- Saving an unrelated field on a Post that has a key leaves the sidecar untouched (the field-drop
  regression above).
- Deleting one Content translation of a Post leaves the sidecar untouched.

## Related

[01 generic sidecar service](01-generic-sidecar-service.md) ·
[04 HLS key as a sidecar](04-hls-key-as-sidecar.md) ·
[07 no encryption at rest](07-no-encryption-at-rest.md)
