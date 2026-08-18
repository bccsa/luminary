# 04 — Encryption keys as sidecar documents

> **Task:** Encryption keys are "sidecar" documents to a given Post / Tag — the Post / Tag carries
> the ID of the sidecar document.

## What exists today

`MediaDto` (`api/src/dto/MediaDto.ts`) already models exactly this relationship, pointing at a
crypto document instead of a sidecar:

```ts
export class MediaDto {
    @IsString() @Expose()
    hlsUrl: string;

    /** ID to the CryptoObject where the (optional) encryption key is stored */
    @IsOptional() @IsString() @Expose()
    hlsKey_id?: Uuid;

    /**
     * Optional field for submitting an HLS encryption key for a newly added HLS URL.
     * When set, this key is stored as a crypto object, and the crypto object ID is
     * exposed as the hlsKey_id.
     */
    @IsOptional() @IsString() @Expose({ toClassOnly: true })
    hlsKey?: string;
}
```

`media` lives on `_contentParentDto` (`api/src/dto/_contentParentDto.ts:51`), so both `PostDto` and
`TagDto` carry it, alongside `mediaBucketId`. `processPostTagDto.ts:122` copies the whole `media`
object onto every child Content doc as `parentMedia` — which is how the app player gets the
`hlsUrl`.

So the "parent carries the ID" requirement is already satisfied structurally. The work is to
**re-point it at a sidecar** and to be careful about what that copy propagates.

## Proposed changes to `MediaDto`

**Keep the field name `hlsKey_id`.** Only what it points at changes — a sidecar document instead of
a crypto document — so the change is a doc comment, not a rename:

```ts
export class MediaDto {
    @IsString() @Expose()
    hlsUrl: string;

    /**
     * ID of the sidecar document holding this collection's (optional) decryption key.
     * The key itself is never on this document — clients fetch it from GET /sidecar.
     */
    @IsOptional() @IsString() @Expose()
    hlsKey_id?: Uuid;

    /**
     * Write-only: an encryption key submitted with a newly added HLS URL. Stored as a
     * masked sidecar and dropped before the document is written, so it never rests here.
     */
    @IsOptional() @IsString() @Expose({ toClassOnly: true })
    hlsKey?: string;
}
```

An earlier draft of this document proposed renaming the field to `sidecar_id` for consistency with
the generic service. **Dropped**, for two reasons:

- **It buys nothing and costs front-end churn.** The rename would touch
  `EditContentVideo.vue`, its spec, and `shared/src/types/dto.ts`, none of which this ticket
  otherwise needs to change. Front-end work is out of scope.
- **`hlsKey_id` is the better name anyway.** It names the field's *role* (where this collection's
  key lives) rather than its *storage mechanism*. `MediaDto` is a media object, not a sidecar
  registry — a reader there cares which key, not which internal document type holds it. The same
  logic makes `StorageDto.credential_id` the right name for its crypto reference.

If a parent ever needs a second sidecar type, it gets its own appropriately-named field, or
`_contentParentDto` grows a `sidecarIds: Record<SidecarType, Uuid>`. Not needed now; noting the
seam.

## Is `hlsKey_id` even necessary, given deterministic IDs?

[01](01-generic-sidecar-service.md) proposes `_id = \`sidecar-${parentId}-${sidecarType}\``, so the
client could derive the ID without being told it. Keep the stored field anyway, for two reasons:

- **It is the existence flag.** A derivable ID tells you where a sidecar *would* be, not whether
  one *is*. Without the stored field, the app cannot tell an unencrypted collection from an
  encrypted one without a round-trip that 404s — a wasted request on every unencrypted video.
  The CMS already relies on this signal: `hasStoredKey` in `EditContentVideo.vue:57`.
- **It decouples the client from the ID scheme.** If one-per-type ever stops holding and we move to
  indexed lookup, clients that read the stored ID keep working.

## Propagation to Content documents

`processPostTagDto.ts:122` does `contentDoc.parentMedia = doc.media`. With the change above,
`parentMedia.hlsKey_id` therefore reaches every app client that syncs the Content doc.

**That is intended and safe.** The sidecar ID is not a secret — it is a lookup handle, and every
read through it is permission-checked against the parent ([02](02-sidecar-rest-endpoint.md)). It is
also *necessary*: the app player holds a Content doc, and [10](10-retrieval-by-parent-id.md) has it
call `/sidecar` with the Content's `parentId`. Knowing a key exists before asking is what lets the
player skip the request entirely for unencrypted collections.

What must **not** propagate is `hlsKey`. `@Expose({ toClassOnly: true })` handles that today and
must be preserved — the existing test `processMediaDto.spec.ts:26`
(`expect(media.hlsKey).toBeUndefined()`) is the guard; keep an equivalent.

## The write path

`processMedia` (`api/src/changeRequests/documentProcessing/processMediaDto.ts`) becomes:

```ts
if (media.hlsKey) {
    try {
        media.hlsKey_id = await upsertHlsKeySidecar(db, parent, {
            maskedKeyHex: maskKeyHex(sidecarId(parent._id, SidecarType.HlsEncryptionKey), media.hlsKey),
        });
    } catch (error) {
        throw new Error(`Failed to store the HLS key: ${error.message}`);
    } finally {
        // Dropped whether or not it was stored, and before the caller can catch:
        // a key that failed to store must not reach the document either.
        delete media.hlsKey;
    }
}
```

The `finally`-block comment is preserved verbatim from the current implementation — the reasoning
is unchanged and correct.

### A failed key store must fail the change request

The `throw` above is currently swallowed, and the result is silent data loss. Follow the call
chain as it stands on this branch:

```ts
// processPostTagDto.ts:107
try {
    warnings.push(...(await processMedia(doc.media, db)));
} catch (error) {
    warnings.push(`Media processing failed: ${error.message}`);   // ← not rethrown
}
```

So if storing the key fails: `processMedia`'s `finally` has already deleted `media.hlsKey`, the
error becomes a warning string, the change request **succeeds**, and the Post is saved with an
`hlsUrl` and no `hlsKey_id`. The editor gets a warning in a response body they very likely do not
read, and the only copy of that key — which existed for exactly the duration of one HTTP request —
is gone. The collection is unplayable and unrecoverable without re-encoding.

That is tolerable for image processing, where the warning path came from and where the source file
still exists on the editor's machine. It is not tolerable for a key.

**Rethrow for the key specifically.** Media processing has two failure classes and they deserve
different handling:

```ts
// A key we were given and failed to store is unrecoverable — the plaintext existed only
// in this request and processMedia has already dropped it. Fail the change request so the
// editor still holds the key and can retry, rather than saving a collection that can never
// be decrypted. Other media warnings stay warnings.
```

Whether that is implemented as a distinct error class, a flag on the return value, or by moving the
sidecar write out of the try/catch is an implementation choice. What must not survive is *"the key
was lost, here is a warning, saved successfully."*

Note this interacts with the ordering hazard below: fail-on-error means a brand-new Post whose key
fails to store is not created at all, which is the correct outcome.

Note `upsertHlsKeySidecar` needs the **parent document**, not just the media object, because it copies
`memberOf` ([05](05-memberof-replication.md)) and needs `parent._id` for the deterministic ID.
`processMedia`'s signature changes accordingly; `processPostTagDto.ts:108` is the only caller.

### Ordering hazard

`processPostTagDto` calls `processMedia` *before* `db.upsertDoc(doc)` runs on the parent. So on the
**first** save of a brand-new Post with a key, the sidecar is written before its parent exists. If
the parent write then fails, an orphaned sidecar is left behind — inert, per
[03](03-lifecycle-and-deletion.md), but untidy. Options: accept it (recommended — matches how
`processImage` already uploads to S3 before the doc is written), or move sidecar writes to after
the parent upsert (a larger restructure of the processing pipeline, out of scope here).

## The CMS needs no changes

Keeping the field name is what buys this. `EditContentVideo.vue:57` (`hasStoredKey`),
`EditContentVideo.spec.ts:86` (the `hlsKey_id: "crypto-1"` fixture — cosmetically stale, since the
value is now a sidecar ID, but functionally correct as an opaque string), `EditContentMedia.vue`,
`useMediaEncoder.ts` and `EncodeMediaButton.vue` all keep working unmodified.

The write-only `media.hlsKey` submit field is unchanged too, so the CMS→API contract is byte-for-byte
what it is today. **The entire change is server-side**, which is exactly the scope this ticket wants.

## Files to touch

| File | Change |
|---|---|
| `api/src/dto/MediaDto.ts` | doc comment only — `hlsKey_id` now names a sidecar, not a crypto doc |
| `shared/src/types/dto.ts` | nothing (the mirror is a plain `hlsKey_id?: Uuid` and stays valid) |
| `api/src/changeRequests/documentProcessing/processMediaDto.ts` | write a sidecar instead of a crypto doc |
| `api/src/changeRequests/documentProcessing/processPostTagDto.ts` | pass the parent + `prevDoc.media` into `processMedia` |

## Tests

- A change request with `media.hlsKey` produces a sidecar and a `media.hlsKey_id` on the saved
  Post, with **no `hlsKey`** on the stored document.
- **A failing sidecar write fails the change request** — the Post is not saved with an `hlsUrl` and
  a missing `hlsKey_id`, and the response is an error rather than a success carrying a warning.
  (Simulate by making `upsertHlsKeySidecar` throw.)
- The sidecar's `parentId` / `parentType` match the Post.
- Child Content documents receive `parentMedia.hlsKey_id` and **not** `parentMedia.hlsKey`.
- Existing coverage to adapt rather than delete: `processMediaDto.spec.ts`,
  `processPostTagDto.spec.ts:563`, `validateChangeRequest.spec.ts:297`.

## Related

[01 generic sidecar service](01-generic-sidecar-service.md) ·
[06 key masking](06-key-masking.md) ·
[07 no encryption at rest](07-no-encryption-at-rest.md) ·
[03 lifecycle](03-lifecycle-and-deletion.md)
