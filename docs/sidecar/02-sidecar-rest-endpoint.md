# 02 — The `sidecar` REST endpoint

> **Task:** API endpoint name: `sidecar`.

Companion documents: [09 authentication](09-authentication.md) covers the guard,
[10 retrieval by parent ID](10-retrieval-by-parent-id.md) covers lookup semantics. This one covers
the endpoint's shape and wiring.

## Pattern to follow

`api/src/endpoints/encoderConfig.controller.ts` is the closest existing sibling: a small `@Get`
that resolves a document, checks one permission against `PermissionSystem.verifyAccess`, and
returns a purpose-shaped response rather than a stored document. It was added on this same branch
for the media work, so following it keeps the media feature internally consistent.

Its skeleton, which the sidecar controller should mirror:

```ts
@Controller("storage")
export class EncoderConfigController {
    constructor(private readonly dbService: DbService) {}

    @Get("encoderconfig")
    @UseGuards(AuthGuard)
    async getEncoderConfig(
        @Query("bucketId") bucketId: string,
        @Query("apiVersion") apiVersion: string,
        @Req() request: FastifyRequest,
    ): Promise<EncoderConfigResponseDto> {
        await validateApiVersion(apiVersion);
        const userDetails = request.user;
        …
    }
}
```

Note `validateApiVersion` (`api/src/validation/apiVersion.ts`) is currently a no-op stub
(`clientVersion != clientVersion` is always false — there is a `TODO: Implement API versioning`).
Call it anyway: every other endpoint does, and when versioning lands this endpoint should be
covered without a sweep.

## Proposed contract

```
GET /sidecar?parentId=<uuid>&sidecarType=hlsEncryptionKey&apiVersion=<v>
Authorization: Bearer <jwt>
x-auth-provider-id: <provider doc id>
```

**200**
```json
{
  "sidecarId": "sidecar-post-abc-hlsEncryptionKey",
  "parentId": "post-abc",
  "sidecarType": "hlsEncryptionKey",
  "data": { "maskedKeyHex": "3f2a…" }
}
```

`sidecarId` is in the response because the client needs it to unmask
([06](06-key-masking.md)) — it is the mask seed.

### Response headers

```
Cache-Control: no-store
```

Not optional, and not covered by masking. [06](06-key-masking.md) justifies masking partly as
protection against proxy caches, but the header is the actual control — masking only means a cached
copy is a masked key rather than a plain one, and the seed is derivable from the same response.

The specific thing to worry about is not a shared HTTP proxy (a `GET` with an `Authorization`
header is not cached by a well-behaved one) but the client: `app/` is a PWA with a service worker,
and a cached key response would sit in Cache Storage indefinitely, outside the sync engine's
eviction logic. That is the client-side half of the offline-playback question
[10](10-retrieval-by-parent-id.md) leaves open, and `no-store` keeps it from being answered by
accident.

| Status | When |
|---|---|
| 400 | `parentId` missing, or `sidecarType` missing / not a `SidecarType` member |
| 401 | anonymous identity where the resource requires an authenticated one ([09](09-authentication.md)) |
| 403 | caller lacks the required permission on the parent's `memberOf` |
| 404 | parent not found, **or** parent not currently available (draft / scheduled / expired — see below), **or** no sidecar of that type |
| 409 | sidecar exists but its `data` fails that type's guard (e.g. `isHlsEncryptionKeyData`) — corrupt at rest |

### Why 404 for "parent exists but has no sidecar"

Returning 404 for both "no such parent" and "no sidecar" avoids using the response to probe which
Post IDs exist. The permission check runs *before* the sidecar lookup and returns 403 only for a
parent the caller can see — so a caller can already enumerate their own visible parents through
sync, and nothing is leaked. For a parent they cannot see, they get 404 either way.

An alternative — 200 with `data: null` for "no sidecar" — is friendlier for the player, which
treats "unencrypted collection" as a normal outcome rather than an error. `fetchEncoderSessionKey`
in `cms/src/util/mediaEncoder.ts:169` already establishes the house style here: *"Returns undefined
when the session is unencrypted (404) — which is an answer, not a failure."* **Recommendation: keep
404 and let the client map it to `undefined`, matching that precedent.**

### Why one parent per request

The whole point of [08](08-query-api-exclusion.md) is that keys cannot be bulk-extracted. An array
`parentIds` parameter would reintroduce exactly the extraction primitive we removed from `/query`.
If the player ever needs several keys it should issue several requests; the rate limiter
(`api/src/ratelimit/`) is the right place to bound that, not a batch parameter.

## Permission check

```ts
const parent = (await this.dbService.getDoc(parentId)).docs?.[0];
if (!parent || (parent.type !== DocType.Post && parent.type !== DocType.Tag))
    throw new HttpException("Not found", HttpStatus.NOT_FOUND);

const hasPermission = PermissionSystem.verifyAccess(
    parent.memberOf,
    parent.type,          // Post or Tag — the sidecar's own type has no ACL entries
    AclPermission.View,
    userDetails.groups,
);
if (!hasPermission) throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);
```

Permissions are checked against **the parent's doc type**, never against `DocType.Sidecar` — which
deliberately has no entry in `aclValidation.ts` so no ACL can ever grant it directly
([08](08-query-api-exclusion.md)).

Reading the parent doc rather than trusting the sidecar's copied `memberOf` costs one extra
`getDoc` and removes a whole class of bug: if replication ([05](05-memberof-replication.md)) ever
lags, the parent is the authority. The sidecar's `memberOf` is then belt-and-braces.

`View` is the right permission: it is what lets a client hold the Content document carrying the
`hlsUrl`, so anyone who can see the video can get the key to play it.

**But `View` alone is not sufficient** — see the availability check below.

There is no `cms=true` / `CmsView` variant. The CMS does not read keys back
([10](10-retrieval-by-parent-id.md)), so building one would be speculative. If that changes, the
shape to add is the same `cms ? CmsView : View` switch that `/query` and `/fts` use (ADR 0013),
with the availability check skipped for CMS callers exactly as those endpoints skip their
published/expiry filters.

## Availability check

**Decided:** draft, scheduled and expired parents are refused, even to a caller holding `View`.

### Why the permission check does not already cover this

A `View` grant is on a *group*, and it is permanent. Publication state is per Content document and
changes over time. `/query` handles the gap by injecting publish/expiry filters *after* the
permission filter (`query.service.ts`, the `if (!query.cms)` branch) — permission decides *which
groups*, publication state decides *which documents right now*.

A key request names a **parent** (Post/Tag), and parents have no `status` or `expiryDate` — those
live on their Content children. So none of the existing filters apply, and a caller with `View` on
a group could otherwise fetch the key for a Post that is still an unpublished draft, or one whose
content expired last year. That is a real leak: the encrypted segments are already sitting at a
public `hlsUrl`, and the key is the only thing standing between an unreleased video and anyone who
guesses the URL.

### The rule

A parent is **available** when it has at least one Content child that a non-CMS caller could
currently receive:

```ts
status === PublishStatus.Published
  && publishDate != null && publishDate <= now
  && (expiryDate == null || expiryDate > now)
```

If no child qualifies → **404**, not 403. The caller may legitimately hold `View`; the resource
simply is not available. 404 also keeps the response indistinguishable from "no sidecar", so the
endpoint does not become an oracle for "which of my visible Posts have unreleased content".

### Where the definition comes from

That predicate is `/fts`'s non-CMS filter (`ftsSearch.service.ts:334` for the `publishDate` clause,
plus the expiry handling around it), not `/query`'s. **They differ:** `/query`'s non-CMS path
filters `status` and `expiryDate` but *not* `publishDate`, so a scheduled Content doc with a future
`publishDate` is returned by `/query` and withheld by `/fts`.

Following the stricter one is the right call for a key endpoint — a video scheduled for next month
should not have a retrievable key today. Worth noting the divergence itself looks like a latent
`/query` bug (the client-side `mangoIsPublished` read-filter compensates, which is why it has not
bitten), but fixing it is a separate ticket and explicitly not part of this work.

### Implementation

`db.getContentByParentId(parentId)` (`db.service.ts:938`) already exists and is backed by the
existing `parentId` CouchDB view with `include_docs: true` — **no new design doc, nothing to add to
`indexNameRegistry.ts`**. It is the same call `processPostTagDto` makes on every parent save, so it
is a well-trodden path.

```ts
/**
 * True when a non-CMS caller could currently receive at least one of this parent's Content
 * documents. Mirrors the /fts non-CMS filter (the stricter of the two — it refuses scheduled
 * content, which /query does not). Keys for unreleased or expired content must not be
 * retrievable: the encrypted segments already sit at a public URL, so the key is the only
 * thing withholding them.
 */
async function isParentAvailable(db: DbService, parentId: Uuid, now: number): Promise<boolean> {
    const { docs } = await db.getContentByParentId(parentId);
    return docs.some(
        (c: ContentDto) =>
            c.status === PublishStatus.Published &&
            c.publishDate != null &&
            c.publishDate <= now &&
            (c.expiryDate == null || c.expiryDate > now),
    );
}
```

Put it next to the sidecar service rather than inline in the controller, so a future CMS path can
skip it by not calling it.

**Cost:** one extra view read per key request, on top of the two `getDoc`s
([10](10-retrieval-by-parent-id.md)). Acceptable — a key is fetched once per video open, not per
segment. If it ever matters, the fix is caching the parent's availability, not dropping the check.

**Language caveat:** the check asks whether *any* translation is live, not whether the caller's
language is. That is deliberate — the key is per-collection, not per-translation, and a caller
watching an available video should not be refused because some other language expired. Refusing
per-language would also require the language-permission machinery from `query.service.ts`, for no
security gain.

## Module wiring

`api/src/app.module.ts` — add `SidecarController` to `controllers`. No new provider is needed if
the sidecar service is a module of functions over the injected `DbService`
([01](01-generic-sidecar-service.md)); make it an `@Injectable()` only if it grows state.

CORS already allows `x-auth-provider-id` (`main.ts`), so no change there.

## Rate limiting

**In scope, not a footnote.** An earlier draft left this as "worth a look during implementation";
that was wrong, and the reason is the per-video key model.

Keys are unique per collection, so a leaked key costs exactly one video. That is the property that
makes this endpoint defensible — but it is also what makes rate limiting load-bearing rather than
hygienic. [08](08-query-api-exclusion.md) removes every bulk read path, so extracting the library
means *N* individually authorised requests. Without a limit, "no bulk extraction" means only "bulk
extraction takes a `for` loop": an authorised caller with `View` on a large group can walk every
parent ID they already hold from sync and harvest the whole encrypted library at HTTP speed. The
absence of a batch parameter is cosmetic if the endpoint answers a thousand single requests a
second.

**Built.** `SidecarRateLimiterService` (`api/src/ratelimit/sidecarRateLimiter.service.ts`) wires two
independently-bucketed limiters into `GET /sidecar`, both built on the same config-gated
`StrikeLimiter` wrapper (`api/src/ratelimit/rateLimiter.service.ts`) that `QueryRateLimiterService`
uses for `/query` — extracted to a shared class rather than duplicated once a second call site
needed the identical logic:

- **A per-identity request rate on successful reads** (`read`). This is the one that bounds
  harvesting. It defaults **on** — unlike the query limiter, whose default-off setting is
  defensible because `/query` is already permission-filtered and returns data the caller syncs
  anyway.
- **A strike limit on repeated 403/404s** (`probe`), which bounds probing for parent IDs. Lower
  value than `read`, since [10](10-retrieval-by-parent-id.md)'s 404-for-both rule already makes
  probing uninformative. 400s and 409s do not strike this limiter — they reveal nothing a caller
  didn't already know.

Concrete limits (low tens per minute per identity for `read`, matching the real access pattern of
one key fetch per video open) are recorded in ADR 0018, along with the rationale for the specific
numbers. Both are tunable per environment via `SIDECAR_RATE_LIMIT_READ_*` /
`SIDECAR_RATE_LIMIT_PROBE_*` env vars.

## Audit logging

Nothing in this design records who fetched which key when. Decide explicitly rather than by
default:

- **For:** it is the first question asked after a suspected leak, and this is the only endpoint in
  the system that dispenses secrets. The rate limiter needs per-identity counters anyway, so the
  data is partly there.
- **Against:** volume (one line per video open), and it is a new class of personal-data retention —
  a durable record of who watched what, which nothing else in Luminary keeps.

Note the related gap: sidecars are written server-side and never pass through
`processChangeRequest`, which is what stamps `updatedBy`. So a sidecar has no meaningful author
field unless `upsertSidecar` sets one (the parent's `updatedBy` is the sensible value —
[01](01-generic-sidecar-service.md)). Worth doing regardless of the logging decision, since it
costs one line and an empty `updatedBy` on a key document is a question waiting to be asked.

If the answer is "not now", say so in the ADR, because silence reads as oversight.

## Files to create / touch

| File | Change |
|---|---|
| `api/src/endpoints/sidecar.controller.ts` | new |
| `api/src/endpoints/sidecar.controller.spec.ts` | new |
| `api/src/sidecar/sidecar.service.ts` | add `isParentAvailable` |
| `api/src/app.module.ts` | register the controller |
| `api/docs/rest-api/README.md` | document the endpoint |

## Tests

`sidecar.controller.spec.ts` alongside `storageStatus.controller.spec.ts` /
`ftsSearch.controller.spec.ts` for structure. Needs CouchDB → **user-run**.

- 200 with the expected body for a permitted caller whose parent has live published content.
- 403 for a caller without `View` on the parent's groups.
- 404 for an unknown `parentId`, and for a known parent with no sidecar of that type.
- 400 for a missing `parentId` and for `sidecarType=nonsense`.
- The response contains no field beyond the documented four — in particular no `memberOf`,
  `_rev`, or `updatedBy`.
- The response carries `Cache-Control: no-store`.

Availability check — one case per branch of the predicate, each with a caller who **does** hold
`View`, so the test proves the check is doing the work and not the permission filter:

- All children `status: Draft` → 404.
- Only child published but `publishDate` in the future (scheduled) → 404. *This is the case that
  distinguishes the `/fts` rule from the `/query` rule — if it ever starts passing, someone has
  loosened the predicate.*
- Only child published but `expiryDate` in the past → 404.
- Parent with two children, one draft and one live → **200** (any-child rule).
- Parent with a live child whose language the caller cannot view → still 200 (the deliberate
  language caveat above).
- A parent with no Content children at all → 404.

## Related

[09 authentication](09-authentication.md) · [10 retrieval by parent ID](10-retrieval-by-parent-id.md) ·
[08 query exclusion](08-query-api-exclusion.md)
