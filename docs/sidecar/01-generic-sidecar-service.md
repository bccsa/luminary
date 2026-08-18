# 01 — Generic sidecar object service

> **Task:** Implement as a generic "sidecar object" service, with a `memberOf` field and a `data`
> field. The `data` field should support any type (object, string, number, …). Check how TypeScript
> enforcing can be implemented best.

## What exists today

- Every persisted document extends `_baseDto` (`api/src/dto/_baseDto.ts`) — `_id`, `_rev`, `type`,
  `updatedBy`, `updatedTimeUtc`, `deleteReq`.
- Documents that participate in the permission system extend `_contentBaseDto`
  (`api/src/dto/_contentBaseDto.ts`), which adds `memberOf: Uuid[]` with `@ArrayNotEmpty()`.
- `CryptoDto` extends `_baseDto` and already has a `data: any` — but no `memberOf`, and it is
  encrypted at rest. See [07](07-no-encryption-at-rest.md) for why it isn't the answer.
- `class-validator` decorators are enforced by the global `ValidationPipe` and by
  `validateChangeRequest` (`api/src/changeRequests/validateChangeRequest.ts`). Every persisted
  field needs `@Expose()` from `class-transformer` — `instanceToPlain` in `db.upsertDoc` drops
  un-exposed fields on write (`api/src/db/db.service.ts:533`).
- `api/tsconfig.json` has `strictNullChecks: false` and `noImplicitAny: false`. Type-level
  guarantees here are advisory; anything that actually matters needs a runtime guard too.

## Proposed document shape

New `DocType.Sidecar = "sidecar"` in `api/src/enums.ts` (and, with a caveat, in
`shared/src/types/enum.ts` — see the [README](README.md#cross-cutting-things-that-must-not-be-forgotten)).

> **Do not land this enum member on its own.** Adding it removes the check that currently rejects a
> forged `doc.type: "sidecar"` change request, so it must arrive in the same commit as the
> exclusions in [08](08-query-api-exclusion.md). That is why the
> [implementation order](README.md#implementation-order) makes 01 + 05 + 08 a single step.

```ts
// api/src/dto/SidecarDto.ts
import { IsDefined, IsEnum, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { DocType, SidecarType, Uuid } from "../enums";

/**
 * A payload that belongs to a Post / Tag but is never replicated to clients.
 *
 * Sidecars exist for data that is permission-gated like its parent but must not travel
 * with it: sync, socket rooms and /query all exclude this type, and the only way to read
 * one is the dedicated /sidecar endpoint. `memberOf` is copied from the parent so the
 * ordinary permission system can gate it without a new concept.
 */
export class SidecarDto extends _contentBaseDto {
    /** The Post / Tag this sidecar belongs to. */
    @IsString()
    @Expose()
    parentId: Uuid;

    /** Post or Tag — the doc type permissions are checked against. */
    @IsEnum(DocType)
    @Expose()
    parentType: DocType.Post | DocType.Tag;

    /** Discriminator for the shape of `data`. */
    @IsEnum(SidecarType)
    @Expose()
    sidecarType: SidecarType;

    /**
     * Arbitrary JSON payload. Deliberately untyped at this level — the shape is
     * determined by `sidecarType` and validated by that type's own module (e.g.
     * sidecar/hlsEncryptionKey.ts). `unknown`, not `any`, so readers must narrow.
     */
    @IsDefined()
    @Expose()
    data: unknown;
}
```

`memberOf` comes free from `_contentBaseDto`, including its `@ArrayNotEmpty()` — which is what we
want (a sidecar with no groups would be readable by nobody and is always a bug). See
[05](05-memberof-replication.md).

## Enforcing the type of `data`

`data: any` is what `CryptoDto` does and it is unpleasant to consume: every read site casts, and
nothing catches a mismatch. Four options were considered; **Option D is the recommendation.**

### Option A — generic class `SidecarDto<T>`

```ts
export class SidecarDto<T = unknown> extends _contentBaseDto { data: T; }
```

**Rejected.** `class-validator`/`class-transformer` are decorator- and metadata-driven and are
blind to generic parameters: `plainToInstance(SidecarDto, plain)` cannot pick a `T`, so runtime
validation of `data` is impossible and the generic buys only cosmetic call-site typing. It also
infects every signature that passes a sidecar around.

### Option B — type map + validator registry keyed on `sidecarType`

Keep the persisted class monomorphic with `data: unknown`, and layer a compile-time
`SidecarDataMap` (`sidecarType` → payload type) plus a `SIDECAR_VALIDATORS` mapped type over it,
mirroring the `DocTypeMap` pattern in `validateChangeRequest.ts:22`. Consumers narrow through a
`SidecarOf<T>` alias and an `asSidecar(doc, type)` cast helper.

**Considered and deferred.** This was the original recommendation in this document; it is written
down here because the reasoning for *not* doing it is the useful part.

The one property the map buys is **forced completeness**: `{ [T in SidecarType]: … }` makes adding
a `SidecarType` member a compile error until its payload type and validator both exist. That sounds
valuable and mostly isn't — an enum member with no payload defined is inert. Nothing writes a
document with it until someone writes that code, and that code cannot compile without knowing the
shape it is writing. So the map forces completeness about a situation that cannot cause a bug.

Against that it charges real complexity at **N = 1 sidecar type**: a mapped type, a `SidecarOf<T>`
alias, and an `asSidecar()` helper that every consumer has to learn in order to reach a field.

**Revisit when there are three or four sidecar types** — at that point the per-type wrappers in
Option D start outnumbering the map entries that would replace them, and "which sidecar types exist
and what does each carry" stops being answerable at a glance. Migrating is mechanical rather than a
rewrite, because every caller already goes through the service functions rather than touching
`data` directly.

### Option C — nested `@ValidateNested()` DTO classes per sidecar type

Would give full `class-validator` coverage of `data`, but requires the union to be resolved before
`plainToInstance` runs (class-transformer's `discriminator` option is fragile here and unused
elsewhere in this codebase). More machinery than the single payload type we have. Worth
reconsidering only if `data` shapes grow complex enough to need per-field messages.

### Option D — `data: unknown` + a named payload type + typed wrappers (recommended)

The persisted class carries `data: unknown` — **not `any`**, which is the whole point: `unknown`
forces a consumer to narrow before touching a field, so a wrong assumption is a compile error
rather than a runtime `undefined`. That alone fixes the `CryptoDto` complaint.

Then one named type per payload, and one thin typed wrapper pair per sidecar type over the generic
service:

```ts
// api/src/enums.ts
export enum SidecarType {
    HlsEncryptionKey = "hlsEncryptionKey",
}
```

```ts
// api/src/sidecar/hlsEncryptionKey.ts

/** The masked AES-128 key for an HLS collection. See docs/sidecar/06-key-masking.md. */
export type HlsEncryptionKeyData = {
    /** AES-128 key, hex, XOR-masked with SHA-256(sidecar _id)[0..15]. */
    maskedKeyHex: string;
};

/** Guard for a payload read back out of the database. */
export function isHlsEncryptionKeyData(data: unknown): data is HlsEncryptionKeyData {
    const d = data as HlsEncryptionKeyData;
    return typeof d?.maskedKeyHex === "string" && /^[0-9a-f]{32}$/.test(d.maskedKeyHex);
}

/**
 * The typed door to this sidecar type. Everything that reads or writes an HLS key goes
 * through these two functions, so the pairing of sidecarType to payload shape is pinned
 * in exactly one place — no type-level registry needed to enforce it.
 */
export function upsertHlsKeySidecar(
    db: DbService,
    parent: PostDto | TagDto,
    data: HlsEncryptionKeyData,
): Promise<Uuid>;

export function getHlsKeySidecar(
    db: DbService,
    parentId: Uuid,
): Promise<HlsEncryptionKeyData | undefined>;
```

`upsertHlsKeySidecar` calls the generic `upsertSidecar(db, parent, SidecarType.HlsEncryptionKey,
data)`; `getHlsKeySidecar` calls the generic `getSidecar` and runs `isHlsEncryptionKeyData` on the
result, throwing on a corrupt payload (the 409 case in [02](02-sidecar-rest-endpoint.md)).

**Why this is the better answer here.** It satisfies the task's requirement literally — the generic
core takes `data: unknown`, so a sidecar payload can be an object, a string, a number, anything
JSON-serialisable — while every *actual* call site is fully typed. It is two functions and a guard
instead of a mapped type, an alias and a cast helper, and it reads as ordinary TypeScript that
needs no explanation. The cost is that the type↔payload pairing lives in function signatures rather
than one table, which is fine at one or two sidecar types and stops being fine at four (see
Option B's revisit trigger).

## The service

Sidecars are **not** written through `POST /changerequest`. There is no client-authored sidecar:
they are produced server-side as a side effect of processing the parent document (today, of
`media.hlsKey` arriving on a Post/Tag). Keeping them off the change-request path means they never
appear in `DocTypeMap`, never need an entry in `aclValidation.ts`, and cannot be forged by a
client. See [08](08-query-api-exclusion.md).

That makes the "service" a small module of functions over `DbService`, not a Nest provider with
its own change-request plumbing.

The core is deliberately **untyped in `data`** — it is the generic sidecar mechanism, and it should
not know that HLS keys exist. Type safety is added by the per-type wrappers above, which are the
only things application code calls:

```ts
// api/src/sidecar/sidecar.service.ts — the generic core

/** Deterministic ID — see "Identity" below. Never inline this template at a call site. */
export function sidecarId(parentId: Uuid, sidecarType: SidecarType): Uuid;

/** Create or replace the sidecar for (parent, type). Copies memberOf from the parent. */
export async function upsertSidecar(
    db: DbService,
    parent: PostDto | TagDto,
    sidecarType: SidecarType,
    data: unknown,
): Promise<Uuid>;

/** Read one sidecar. Returns undefined when absent — absence is an answer, not an error. */
export async function getSidecar(
    db: DbService,
    parentId: Uuid,
    sidecarType: SidecarType,
): Promise<SidecarDto | undefined>;

/** Hard-delete one sidecar. No DeleteCmd — clients never held it. */
export async function deleteSidecar(db: DbService, parentId: Uuid, sidecarType: SidecarType): Promise<void>;

/** Hard-delete every sidecar of a parent. Used by the parent's cascade delete. */
export async function deleteSidecarsForParent(db: DbService, parentId: Uuid): Promise<void>;
```

The layering rule worth stating in a comment on this file: **`sidecar.service.ts` never imports a
payload type, and application code never calls `upsertSidecar`/`getSidecar` directly.** Keeping
that boundary is what makes a later move to Option B's registry a contained change.

## Identity: deterministic IDs

**Decided:** `_id = \`sidecar-${parentId}-${sidecarType}\``.

Why:

- **No CouchDB index needed.** Every read and delete is a primary-key `db.getDoc()` /
  `db.deleteDoc()` — strongly consistent, no design doc, nothing added to
  `db/indexNameRegistry.ts`. The codebase already prefers this: `db.service.ts:491` switched
  `statusChangeDeleteCmdId` to primary-key deletion precisely to escape an unindexed Mango find.
- **Idempotent writes.** Re-saving a parent with the same key rewrites the same document instead of
  accumulating orphans. (The current crypto path does *not* have this property — see
  `processMediaDto.spec.ts:45`, which asserts two saves produce two different crypto docs. Every
  edit of an HLS URL leaks a crypto doc today.)
- **`deleteSidecarsForParent` needs no query** — iterate `Object.values(SidecarType)` (a handful of
  members, forever) and delete by key.

The accepted trade-off: exactly one sidecar per `(parentId, sidecarType)` pair. If a parent ever
needs *n* sidecars of the same type, this scheme breaks and we would need a `sidecar-by-parent`
design doc index instead. The requirement says "the Post/Tag carries the ID of the sidecar
document" (singular), so one-per-type is the intended model — and adding the index later is a
contained change, since every caller goes through the service functions below rather than
constructing IDs itself. **Keep ID construction inside `sidecarId()`; never inline the template
string at a call site.** That one discipline is what makes the escape hatch cheap.

The parent still stores the resulting ID explicitly (see [04](04-hls-key-as-sidecar.md)) — the ID
being derivable does not make the stored reference redundant, because the stored reference is what
tells us a sidecar *exists*.

## `DbService` interactions to get right

- **Set `updatedBy` explicitly.** `_baseDto` carries it, but the thing that normally populates it
  is `processChangeRequest` (`doc.updatedBy = userId`), and sidecars deliberately never travel that
  path. Copy the parent's `updatedBy` in `upsertSidecar` — it is the identity that submitted the
  key. Without it every key document has an empty author field, which is exactly the field anyone
  investigating a key would look at first (see [02](02-sidecar-rest-endpoint.md#audit-logging)).
- **Write with `db.upsertDoc()`**, which stamps `updatedTimeUtc` and emits an `update` event.
  That event reaches `Socketio.upsertDoc`'s fan-out — harmless (no client joins a `sidecar-*`
  room), but [08](08-query-api-exclusion.md) proposes an explicit early return so the guarantee is
  stated in code rather than inferred.
- **`upsertDoc` emits a `PermissionChange` DeleteCmd when `memberOf` changes** on any non-Group doc
  (`db.service.ts:472`). For a sidecar that would broadcast a `deleteCmd` with
  `docType: "sidecar"` into `deleteCmd-${group}` rooms — noise about a document clients never had.
  Add `DocType.Sidecar` to that exclusion alongside `DocType.Group`. See
  [05](05-memberof-replication.md).
- **Delete with `db.deleteDoc()`, not `deleteReq`.** Setting `deleteReq` routes through
  `insertDeleteCmd` (`db.service.ts:462`) and produces the same pointless broadcast.

## Files to create / touch

| File | Change |
|---|---|
| `api/src/enums.ts` | `DocType.Sidecar`, new `SidecarType` enum |
| `shared/src/types/enum.ts` | mirror `DocType.Sidecar` + `SidecarType` |
| `api/src/dto/SidecarDto.ts` | new |
| `api/src/sidecar/hlsEncryptionKey.ts` | new — `HlsEncryptionKeyData`, its guard, and the typed wrapper pair |
| `shared/src/types/dto.ts` | mirror `SidecarDto` + payload types |
| `api/src/sidecar/sidecar.service.ts` | new |
| `api/src/db/db.service.ts` | exclude `Sidecar` from the `PermissionChange` DeleteCmd branch |
| `app/src/sync.spec.ts`, `cms/src/sync.spec.ts` | exhaustive `Record<DocType, …>` fixtures gain `sidecar: []` |

## Tests

`api/src/sidecar/sidecar.service.spec.ts`, using `createTestingModule("sidecar")`
(`api/src/test/testingModule.ts`) — it needs a real CouchDB, so **the user runs it, not the agent**.

- `upsertSidecar` writes a doc whose `_id` is the deterministic ID and whose `memberOf` equals the
  parent's.
- A second `upsertSidecar` for the same parent+type replaces rather than duplicates.
- `getSidecar` returns `undefined` for an absent sidecar and the document for a present one.
- `getHlsKeySidecar` throws on a payload that fails `isHlsEncryptionKeyData`.
- `deleteSidecarsForParent` removes every type.
- Pure unit tests for `isHlsEncryptionKeyData` need no DB and can run anywhere.

## Related

[05 memberOf replication](05-memberof-replication.md) · [08 query exclusion](08-query-api-exclusion.md) ·
[03 lifecycle](03-lifecycle-and-deletion.md)
