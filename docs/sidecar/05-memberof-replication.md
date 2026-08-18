# 05 — Replicating the parent's `memberOf` onto the sidecar

> **Task:** Replicate the Post/Tag's `memberOf` property to the `SidecarDto`.

## Why replicate at all

Luminary's permission system is group-based: `PermissionSystem.verifyAccess(memberOf, docType,
permission, userGroups)` needs a `memberOf` array on the document being gated. A sidecar with no
`memberOf` can only be permission-checked indirectly, via its parent — which works for the
`/sidecar` endpoint but leaves the document itself unclassified for anything that iterates
documents generically (schema upgrades, future audit tooling, `getDocsByType`).

This is the same reasoning that makes `ContentDto` carry a copy of its parent's `memberOf` rather
than resolving through `parentId` on every check.

## The existing precedent

`processPostTagDto.ts:116` is the pattern to follow — it is where Post/Tag properties are pushed
down to children:

```ts
const contentDocs = await db.getContentByParentId(doc._id);
for (const contentDoc of contentDocs.docs) {
    contentDoc.memberOf = doc.memberOf;
    contentDoc.parentTags = doc.tags;
    …
    await db.upsertDoc(contentDoc);
}
```

Sidecars need the same treatment, with one simplification: there is at most one sidecar per type
and its ID is derivable ([01](01-generic-sidecar-service.md)), so no `getBy…` query is needed.

## Where replication happens

Two places, both required:

**1. On creation** — `upsertSidecar` takes the parent document and copies `memberOf` from it. This
is why the service signature takes `parent: PostDto | TagDto` rather than a bare `parentId`
([01](01-generic-sidecar-service.md)).

**2. On every parent save** — the parent's `memberOf` can change independently of its media. Add to
the child-propagation loop area of `processPostTagDto`:

```ts
// Sidecars are gated by the same groups as their parent, so a group change has to reach
// them too — the same reason the loop above re-stamps memberOf on every Content child.
await syncSidecarMemberOf(db, doc);
```

`syncSidecarMemberOf` reads each `sidecarId(doc._id, type)` by primary key, and re-writes only
those whose `memberOf` differs. Skipping unchanged documents avoids pointless revisions and
`updatedTimeUtc` churn on every unrelated Post edit.

Placement: alongside the existing Content-propagation loop, **not** inside `processMedia` — this
must run whether or not the change request touched `media`.

## `_contentBaseDto` gives us the validation for free

Extending `_contentBaseDto` ([01](01-generic-sidecar-service.md)) brings:

```ts
@IsArray()
@ArrayNotEmpty()
@IsString({ each: true })
@Expose()
public memberOf: Uuid[];
```

`@ArrayNotEmpty()` is the right constraint here. A sidecar with an empty `memberOf` is readable by
nobody and is always a bug — better to fail the write than to create an unreachable key. (The
parent itself cannot have an empty `memberOf` either, for the same reason, so this can only trip on
a coding error.)

Note these decorators only fire where something calls `class-validator` — the global
`ValidationPipe` and `validateChangeRequest`. Sidecars are written server-side and never travel
through `validateChangeRequest` ([01](01-generic-sidecar-service.md)), so **`upsertSidecar` should
assert non-empty `memberOf` itself** rather than assuming a decorator will catch it. One line:

```ts
if (!parent.memberOf?.length) throw new Error(`Cannot create a sidecar for ${parent._id}: parent has no memberOf`);
```

## The `DeleteCmd` side effect to suppress

`db.upsertDoc` (`api/src/db/db.service.ts:472`) emits a `PermissionChange` `DeleteCmd` whenever a
non-Group document's `memberOf` changes:

```ts
if (
    existing &&
    doc.type !== DocType.Group &&
    (existing as _contentBaseDto).memberOf &&
    doc.memberOf &&
    !isDeepStrictEqual((existing as _contentBaseDto).memberOf.sort(), doc.memberOf.sort())
) {
    await this.insertDeleteCmd({ reason: DeleteReason.PermissionChange, … });
}
```

For a sidecar this would write a `DeleteCmd` with `docType: "sidecar"` and broadcast it into the
shared `deleteCmd-${group}` rooms (`socketio.ts:210`), instructing every connected app and CMS to
evict a document they never received. Harmless in effect — `bulkPut`/delete handling on a missing
ID is a no-op — but it is wire noise, it pollutes the delete-command collection, and it advertises
the existence and group membership of key documents to clients.

**Change:**

```ts
doc.type !== DocType.Group &&
doc.type !== DocType.Sidecar &&   // never replicated, so nothing to evict
```

with a comment saying why. Same reasoning covers the `deleteReq` branch — hence
[03](03-lifecycle-and-deletion.md)'s rule to hard-delete sidecars via `db.deleteDoc()` rather than
`deleteReq`.

## What replication is *not* for

The `/sidecar` endpoint checks permissions against the **parent** document it loads, not against
the sidecar's copied `memberOf` ([02](02-sidecar-rest-endpoint.md)). The copy is defence in depth
and generic-tooling support; the parent stays authoritative. This ordering means a replication lag
or bug cannot widen access — the worst case is a sidecar whose stored `memberOf` is stale while
reads remain correctly gated.

## Files to touch

| File | Change |
|---|---|
| `api/src/dto/SidecarDto.ts` | extends `_contentBaseDto` (covered in 01) |
| `api/src/sidecar/sidecar.service.ts` | copy + assert `memberOf` in `upsertSidecar`; add `syncSidecarMemberOf` |
| `api/src/changeRequests/documentProcessing/processPostTagDto.ts` | call `syncSidecarMemberOf` on every save |
| `api/src/db/db.service.ts` | exclude `Sidecar` from the `PermissionChange` DeleteCmd branch |

## Tests

- A new sidecar's `memberOf` equals its parent's.
- Changing a Post's `memberOf` updates its sidecar's `memberOf`.
- Changing an unrelated Post field leaves the sidecar's `_rev` untouched (no churn).
- Changing a Post's `memberOf` produces **no** `DeleteCmd` with `docType: "sidecar"`.
- `upsertSidecar` throws for a parent with an empty `memberOf`.

## Related

[01 generic sidecar service](01-generic-sidecar-service.md) ·
[02 REST endpoint](02-sidecar-rest-endpoint.md) ·
[08 query exclusion](08-query-api-exclusion.md)
