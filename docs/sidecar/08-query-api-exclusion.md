# 08 — Sidecars must never be retrievable in bulk

> **Task:** Ensure key docs are never retrievable via the query API endpoint (it should not be
> possible to bulk-extract keys).

This is the security-critical document of the set. The single-key endpoint
([02](02-sidecar-rest-endpoint.md)) is only defensible if there is no other way to get at these
documents — so every read path out of the API needs an explicit, tested block.

## The existing precedent: `crypto`

`query.service.ts:107` already does this for crypto documents:

```ts
// Doc-type gate. `type`/`docType` are extracted post-expansion, so this catches
// nested selectors, hybridQuery's unrestricted selector, AND the
// BYPASS_TEMPLATE_VALIDATION escape hatch. Unknown types already fail closed
// (empty viewGroups → Forbidden); this just returns a clearer error. Crypto docs
// (encrypted S3 credentials) are strictly internal and never queryable.
if (type === DocType.Crypto || docType === DocType.Crypto)
    throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);
```

That comment documents exactly why the check sits where it does — after selector expansion, so it
cannot be evaded by nesting, and inside `QueryService` (the data-leakage boundary per
`api/CLAUDE.md`) rather than in the validator. Extend it, don't parallel it:

```ts
// Crypto docs (encrypted S3 credentials) and sidecar docs (media decryption keys and
// other parent-scoped payloads) are strictly internal. Sidecars are served one at a
// time, permission-checked, by GET /sidecar — a bulk read path would defeat that.
const internalTypes: string[] = [DocType.Crypto, DocType.Sidecar];
if (internalTypes.includes(type) || internalTypes.includes(docType))
    throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);
```

Checking `docType` as well as `type` matters: `type: "deleteCmd", docType: "sidecar"` is a real
selector shape, and without the second clause it would be a way to enumerate which parents have
keys.

## Every read path, and what closes it

| Path | Mechanism | Action |
|---|---|---|
| `POST /query` | `QueryService` doc-type gate | **Add `Sidecar` to the block above.** |
| `POST /query` — `use_index` | `db/indexNameRegistry.ts` is warmed from `designDocs/*.json` | **Add no sidecar design doc.** Deterministic IDs ([01](01-generic-sidecar-service.md)) mean we never need an index, so there is nothing to register and nothing to abuse. |
| `POST /fts` | `ftsSearch.service.ts` — Content BM25 path plus a strict aux path for `User`/`Redirect` only (`AUX_FTS_CONFIG`) | Nothing to add if we simply never give `Sidecar` an `AUX_FTS_CONFIG` entry — unknown types fall through. **Add a test** asserting `types: ["sidecar"]` returns nothing/errors, so a future aux-type addition can't quietly include it. Sidecars also never get an `fts` field, since `processContentDto`/`processUserDto` are the only writers of one. |
| Socket.io live updates | Room membership | Clients would have to join `sidecar-${group}`. `joinDocTypeRooms` (`socketio.ts`) derives rooms from `PermissionSystem.accessMapToGroups(accessMap, permission, docTypes)`, which returns no groups for a doc type that has no ACL entries — so the join is a no-op. **Belt and braces:** early-return in the `update` fan-out (see below). |
| Socket.io — ACL | `aclValidation.ts` maps each `DocType` to its permitted `AclPermission`s | **Do not add `DocType.Sidecar`.** `validateAcl` rejects an ACL entry for a type not in that map, so no group can ever be granted `view` on `sidecar`, so `accessMapToGroups` can never return groups for it. This is the actual load-bearing guarantee for the socket path — worth a comment saying so. |
| Sync (`app/src/sync.ts`, `cms/src/sync.ts`) | Explicit `syncList` registration | **Never register `Sidecar`.** Also unreachable anyway: a sync query goes through `/query`, which is blocked. |
| `POST /changerequest` | `DocTypeMap` in `validateChangeRequest.ts:22` | **Do not add `sidecar`, _and_ add an explicit deny.** Omission alone is not a guarantee here — see below. |
| `GET /storage/*` | Unrelated | — |

### The change-request path needs an explicit deny

An earlier draft of this document claimed that leaving `sidecar` out of `DocTypeMap` was
sufficient, and called the equivalent omission in `aclValidation.ts` "the actual load-bearing
guarantee". The ACL claim is correct. **The change-request claim is not**, and the difference is
worth understanding because it is created by this very design.

Trace what happens once `DocType.Sidecar` exists and a client posts a change request with
`doc.type: "sidecar"`:

1. `validateChangeRequest.ts:59` — `!Object.values(DocType).includes(changeRequest.doc.type)`.
   **This is the check that rejects a forged sidecar today, and adding the enum member removes it.**
   Before this feature, `"sidecar"` was not a `DocType` and died here.
2. `plainToInstance(DocTypeMap["sidecar"], …)` — the first argument is `undefined`.
3. `validate(…)` on whatever that produced.
4. `processChangeRequest.ts` — `docProcessMap[doc.type]` is `undefined`, so the processor is
   skipped, and then **`db.upsertDoc(doc)` runs unconditionally.** There is no guard between a
   validation pass and a write.

So the only thing standing between a client-authored sidecar and CouchDB is step 3 failing on an
object with no validation metadata. `class-validator@0.14` defaults `forbidUnknownValues: true`,
which does make that fail — but this is emergent, version-dependent behaviour protecting the most
sensitive document type in the system. A dependency bump, or a global `ValidationPipe` option
change, could flip it silently and no test would notice.

**Add the deny explicitly**, next to the existing doc-type check:

```ts
// Sidecars are written server-side only (media keys and other parent-scoped payloads).
// There is deliberately no entry in DocTypeMap — but since DocType.Sidecar *is* a valid
// enum member, the check above no longer rejects it, and processChangeRequest calls
// db.upsertDoc() for any doc that validates. Deny here rather than relying on
// class-validator's forbidUnknownValues to fail closed on a metadata-less object.
if (changeRequest.doc.type === DocType.Sidecar) {
    return {
        validated: false,
        error: `Submitted "${changeRequest.doc.type}" document validation failed:\nInvalid document type`,
    };
}
```

Reusing the existing "Invalid document type" wording keeps the response indistinguishable from any
other rejected type, so the error is not an oracle for which internal types exist.

The general lesson, worth carrying into the ADR: **adding a member to `DocType` converts
"unrecognised" into "recognised" at every site that consults the enum.** Any guarantee that
previously rested on non-recognition has to be re-established explicitly. `aclValidation.ts` is
unaffected only because its `validDocTypes` is derived from its own permissions map
(`Object.keys(availablePermissionsPerDocType)`) rather than from `DocType`.

### The socket fan-out early return

`socketio.ts` `upsertDoc` resolves a reference document and emits to `${type}-${group}` rooms. With
no ACL entries the room set is empty, so nothing is delivered today. Make it explicit rather than
emergent:

```ts
// Sidecars are never replicated: no client joins a `sidecar-*` room (no ACL entry can
// grant the type — see aclValidation.ts) and none should. Returning here states the
// guarantee in code instead of relying on an empty room set.
if (refDoc.type === DocType.Sidecar) return;
```

Place it next to the `DeleteCmd` special case around `socketio.ts:210`.

## Defence in depth, ordered

1. **No ACL entry can name `sidecar`** — `aclValidation.ts`. Nothing downstream can grant access.
   This one genuinely works by omission (`validDocTypes` comes from the permissions map's own keys).
2. **No change request can name `sidecar`** — `validateChangeRequest.ts`, by an **explicit deny**,
   not by omission. Nothing client-authored can create, modify or delete one.
3. **`/query` refuses the type explicitly** — `query.service.ts`, checked post-expansion.
4. **No design doc / index exists** — nothing to `use_index` against even if 3 were bypassed.
5. **Socket fan-out returns early** — no live delivery.
6. **`/sidecar` is the only door**, one document per request, permission-checked against the
   parent, JWT-authenticated ([09](09-authentication.md)).

Layer 1 is the interesting one: it comes from *not writing code* (omitting a map entry), which
makes it easy to undo accidentally. The omission deserves a comment at the omission site explaining
that it is deliberate, and a test that fails if someone adds the entry. Layer 2 was originally the
same kind of omission and is now an explicit deny, for the reason set out above — when the cost of
being wrong is a forged decryption key, "it fails closed as a side effect" is not a good enough
argument.

## Tests

These are the tests that matter most in the whole feature. Several need CouchDB → **user-run**.

In `query.service.spec.ts` (mirroring the existing crypto cases — find them first and copy the
shape):

- `type: "sidecar"` → 403.
- `type: "deleteCmd", docType: "sidecar"` → 403.
- A nested/`$and`-wrapped selector reaching `type: "sidecar"` → 403 (proves the post-expansion
  placement).
- With `BYPASS_TEMPLATE_VALIDATION=true` → still 403.

In `aclValidation.spec.ts` (see the existing crypto case at line 116):

- An ACL entry of type `sidecar` is rejected.

In `validateChangeRequest.spec.ts` — the most important test in this document, because it guards
the one barrier this feature removes:

- A change request with `doc.type: "sidecar"` is rejected as an invalid document type.
- A change request with `doc.type: "sidecar"` and a *fully well-formed* body (valid `_id`,
  `memberOf`, `parentId`, `sidecarType`, `data`) is still rejected, and **no document is written**.
  Assert the absence of the document, not just the error — the failure mode being guarded against
  is `db.upsertDoc` running after a validation pass, so a test that only checks the error message
  would not catch a regression in step 4 of the trace above.
- A `deleteReq` change request naming an existing sidecar's `_id` is rejected and the sidecar
  survives.

In `ftsSearch.service.spec.ts`:

- `types: ["sidecar"]` returns no documents.

In `socketio.spec.ts`:

- A client requesting `docTypes: ["sidecar"]` in `clientConfigReq` / `joinRooms` joins no room.
- An `update` event for a sidecar document emits to nobody.

## Files to touch

| File | Change |
|---|---|
| `api/src/endpoints/query.service.ts` | add `Sidecar` to the internal-type gate |
| `api/src/socketio.ts` | early return for sidecar in the fan-out |
| `api/src/changeRequests/aclValidation.ts` | comment: omission is deliberate |
| `api/src/changeRequests/validateChangeRequest.ts` | **explicit deny** for `DocType.Sidecar`, plus a comment on the `DocTypeMap` omission |
| `api/src/db/designDocs/` | **no new file** — noted here so nobody adds one reflexively |
| `docs/adr/0018-*.md` | record the containment argument |

## Related

[02 REST endpoint](02-sidecar-rest-endpoint.md) · [09 authentication](09-authentication.md) ·
[01 generic sidecar service](01-generic-sidecar-service.md)
