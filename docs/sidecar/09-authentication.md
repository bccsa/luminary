# 09 — Authentication on the sidecar API

> **Task:** Sidecar API: Authenticated (JWT checking, future session token checking).

## What `AuthGuard` actually does today

`api/src/auth/auth.guard.ts` — read it carefully before assuming it enforces authentication:

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractTokenFromHeader(request);
    const providerId = request.headers["x-auth-provider-id"] as string;

    const result = await this.authIdentityService.resolveOrDefault(token, providerId);
    request.user = result.userDetails;
    return true;                                    // ← always
}
```

`resolveOrDefault` (`authIdentity.service.ts:132`) returns a discriminated union:

```ts
export type IdentityResult =
    | { status: "authenticated"; userDetails: JwtUserDetails }
    | { status: "anonymous"; userDetails: JwtUserDetails };
```

- **With** a token and provider ID: the JWT is verified against the provider's JWKS. An invalid
  token **throws** `UnauthorizedException` with a `reason` of `provider_not_found` or
  `token_invalid` → 401. So a *bad* token is already rejected.
- **Without** a token: no error. The caller gets an anonymous identity with `getDefaultGroups()`,
  and `canActivate` returns `true`. So a *missing* token is currently allowed everywhere.

`AuthGuard` also **discards `result.status`** — only `userDetails` reaches the request, so
downstream code cannot tell an authenticated caller from an anonymous one.

This is correct for the public app: anonymous visitors read published content through default
groups. It is not sufficient for "the sidecar API is authenticated".

## Two readings of the requirement

**Reading A — "gated by the normal permission system, whatever the identity."** Anonymous callers
are allowed, and simply get whatever `View` their default groups grant. If encrypted media is only
ever in groups the default identity lacks, they get 403 naturally.

**Reading B — "an anonymous caller is refused outright,"** regardless of what the default groups
happen to permit.

This document originally recommended **B**. The reviewer has indicated **A**.

### Decided: A — anonymous callers are allowed, gated by the permission check

**Confirm this before implementing step 5** ([README](README.md)); the ticket's own phrasing —
*"Authenticated (JWT checking …)"* — reads more like B, so the two are in tension and only one of
them should survive into the ADR.

What A means concretely:

- **No new code.** `@UseGuards(AuthGuard)`, exactly like `encoderConfig.controller.ts`. No
  `AuthenticatedGuard`, no `authStatus` on the request. The whole "Implementing reading B" section
  below becomes reference material for a decision not taken.
- A caller without a token gets an anonymous identity with `getDefaultGroups()` and is then subject
  to the ordinary `View` check on the parent's `memberOf` plus the availability check
  ([02](02-sidecar-rest-endpoint.md)). If encrypted media lives in groups the default identity
  lacks, they get 403 or 404 naturally.
- A caller with a *bad* token still gets 401 — `resolveOrDefault` throws before the controller runs.
  That behaviour is unchanged and is not what distinguishes A from B.

**What A costs, stated plainly so it is not discovered later.** Under A, whether decryption keys
are public is determined by a *runtime document* — `AutoGroupMappings` and the provider config that
feed `getDefaultGroups()` — rather than by code. Adding a group to the default identity for an
unrelated reason (say, to make a new public landing page visible to logged-out visitors) silently
publishes the keys for every encrypted collection in that group. Nothing in the change request that
makes that edit mentions media, keys, or this endpoint.

Two mitigations, neither of which is a guard, and both of which are cheap:

1. **A test that pins the invariant.** Assert that the default-group identity has no `View` on any
   group carrying media, or — more robustly, since it does not depend on fixture data staying
   representative — that a request with no `Authorization` header for a parent in a non-default
   group is refused.
2. **A note in the ADR and next to `getDefaultGroups()`** recording that default groups are now
   security-relevant for media keys, so the next person widening them has a chance to notice.

The product consequence that drove the decision is the mirror image: under B, **encrypted video
cannot be played by logged-out users at all**. If the app is meant to serve encrypted media
anonymously, B is simply wrong, and no amount of defensive layering makes it right.

## Implementing reading B — not being built

Retained because the decision above is provisional, and because the shape is worth having written
down if session tokens later make "authenticated" a cheaper thing to require.

Preserve the identity status through the guard, then require it:

```ts
// auth.guard.ts — additive, no behaviour change for existing callers
declare module "fastify" {
    interface FastifyRequest {
        user?: JwtUserDetails;
        authStatus?: IdentityResult["status"];   // new
    }
}

// …inside canActivate
request.user = result.userDetails;
request.authStatus = result.status;
```

```ts
// auth/authenticated.guard.ts — new
/**
 * Refuses anonymous identities. AuthGuard resolves an identity and lets anonymous
 * callers through with default groups, which is right for public content but wrong
 * for endpoints whose whole premise is that the caller proved who they are.
 * Stack after AuthGuard: @UseGuards(AuthGuard, AuthenticatedGuard).
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        if (request.authStatus !== "authenticated")
            throw new UnauthorizedException("Authentication required");
        return true;
    }
}
```

NestJS runs `@UseGuards(A, B)` in order, so `AuthGuard` populates the request before
`AuthenticatedGuard` inspects it.

**Do not** infer anonymity from `request.user.userId` being absent. `resolveIdentity` can return an
authenticated identity without a `userId` (there is no guarantee every authenticated principal has
a `User` document), so that test would reject legitimate callers. The explicit status flag is the
reliable signal.

### Alternative considered

A boolean option on `AuthGuard` itself (`@UseGuards(new AuthGuard({ requireAuth: true }))`) avoids
a second class, but `AuthGuard` is dependency-injected (`AuthIdentityService`) and instantiating it
manually loses that. Two guards is the idiomatic Nest answer.

## Error semantics

- **401** — no token, or a token that fails verification. `resolveOrDefault` already throws
  `UnauthorizedException` with `AUTH_FAILURE_MESSAGE` for the latter, deliberately vague to avoid
  acting as an error oracle (see its comment). Keep that: do not add a sidecar-specific message
  that distinguishes failure modes.
- **403** — authenticated, but no `View` on the parent's groups ([02](02-sidecar-rest-endpoint.md)).

Keeping 401 and 403 distinct matters for the client: 401 should trigger the silent-refresh path
that `app/src/main.ts` and `cms/src/main.ts` already implement around `AuthFailureReason`; 403 must
not, or an unauthorised user will loop on token refresh.

## Client side — out of scope, one note for later

No client work in this ticket. The app already sends `Authorization: Bearer …` and
`x-auth-provider-id` on REST calls (the header is in the CORS allowlist in `main.ts`), so the
endpoint is callable as-is.

The one thing worth writing down now, because getting it wrong produces a confusing bug: **a 401
from `/sidecar` must be handled as "refresh and retry once", not as "this video has no key."**
Conflating it with the 404 case turns an expired token into a silently unplayable video. Whoever
builds the player should mirror the `AuthFailureReason` handling already registered *before*
`setupAuth()` in both clients' `main.ts` — `CLAUDE.md` warns explicitly against reordering that.

## Future: session tokens

The task anticipates "future session token checking" — presumably short-lived, narrowly-scoped
tokens for the player, so a long-lived JWT is not attached to every key request (and so a key
request can be authorised without a full identity round-trip).

Nothing in this design needs to change to accommodate that later, provided the guard boundary stays
where it is:

- `AuthenticatedGuard` asks one question — *"is this caller authenticated?"* — and a session-token
  scheme answers it by setting `request.authStatus = "authenticated"` plus a `JwtUserDetails` with
  the session's groups. The controller and permission check are unchanged.
- The natural extension point is `AuthIdentityService.resolveOrDefault`: try the JWT path, then a
  session-token path, then fall back to anonymous. Keeping session-token logic *inside* the
  identity service rather than in the sidecar controller means every endpoint gains it at once and
  none of them grow a bespoke auth path.
- If session tokens end up scoped to a single parent document (a plausible design — "this token is
  good for the key of post-abc"), the scope check belongs in the controller next to the permission
  check, not in the guard.

Recommendation: **do not build any of this now.** Just avoid the two things that would make it hard
later — bespoke auth logic in the sidecar controller, and a guard that hard-codes "JWT" rather than
"authenticated".

## Files to touch

Under the decided reading (A), this table is empty — no auth code is written.

| File | Change | Reading |
|---|---|---|
| `api/src/endpoints/sidecar.controller.ts` | `@UseGuards(AuthGuard)` | A (decided) |
| `api/src/auth/auth.guard.ts` | expose `request.authStatus` (additive) | B only |
| `api/src/auth/authenticated.guard.ts` (+ spec) | new | B only |

## Tests

Under reading A:

- No `Authorization` header, parent in a group the default identity **can** view → 200. This is the
  test that encodes the decision; if someone later implements B, it fails loudly instead of
  silently changing who can watch what.
- No `Authorization` header, parent in a group the default identity **cannot** view → 403 (or 404
  if the parent is also unavailable). This is mitigation 1 above.
- Invalid token → 401 (existing `auth.guard.spec.ts` coverage should already assert the throw) —
  and note this is *not* the anonymous path: a bad token is refused under both readings.
- Valid token, no `View` on the parent → 403, not 401.
- Valid token with `View` → 200.

Under reading B, replace the first case with "no `Authorization` header → 401, and the sidecar is
never read", and add the regression that `/query`, `/fts` and `/storage/*` still admit anonymous
callers — proof that the `authStatus` addition changed nothing for them.

## Related

[02 REST endpoint](02-sidecar-rest-endpoint.md) · [10 retrieval by parent ID](10-retrieval-by-parent-id.md)
