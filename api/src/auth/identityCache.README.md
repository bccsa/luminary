# Identity Cache

`identityCache.service.ts` is a cache that sits in front of `AuthIdentityService.resolveOrDefault`.

## The problem it solves

Resolving a user's identity from their auth token is expensive: verifying the JWT signature, looking up the user in the database, and writing a `lastLogin` timestamp. Without a cache, this full process runs on **every single request**, even if the same user made a request a second ago with the same token.

## How it works

1. A request comes in with a token. `IdentityCacheService.resolveOrDefault(token, providerId)` is called instead of going straight to `AuthIdentityService`.
2. The token is hashed (SHA-256) and used as a cache key — the raw token is never stored.
3. **Cache hit:** the cached groups/user info is returned immediately. The user's permissions (`accessMap`) are recalculated fresh every time, so permission changes are picked up instantly even on a hit.
4. **Cache miss:** the full resolve runs against `AuthIdentityService`, and the result is stored in the cache before being returned.

Both the REST API (`AuthGuard`) and the Socket.io connection handshake use this same cache.

## Off by default

The cache is disabled unless `IDENTITY_CACHE_ENABLED=true` is set. When disabled, every call passes straight through to `AuthIdentityService` — same as if the cache didn't exist.

## Cache entries always expire

Every cached entry has a TTL (time-to-live), set by `IDENTITY_CACHE_TTL_MS` (default: 5 minutes). The cache also never serves an entry past the token's own expiry — whichever comes first wins.

## Cache entries are also cleared early, when needed

Waiting for the TTL isn't always good enough — some changes need to take effect right away:

- A user's group membership changes (they gain or lose access to something) → the whole cache is cleared.
- A user is deleted → the whole cache is cleared, so their now-invalid access stops working immediately.
- An auth provider or group-mapping rule changes → the whole cache is cleared.
- The database connection drops → the whole cache is cleared (we can no longer trust it's up to date).

This is a coarse invalidation — one change clears everyone's cached identity, not just the affected user's. That's a deliberate simplicity trade-off: safe, but it does mean a busy system with frequent membership changes will see a lower cache hit rate.

## Multi-instance note

If the API runs as multiple instances, a *membership addition* on one instance only reaches the others once the TTL expires on their side (removals propagate immediately everywhere, since they also go through the shared database change feed). Pick `IDENTITY_CACHE_TTL_MS` with that window in mind.

## Related files

- `boundedTtlCache.ts` — the underlying generic cache (max size + expiry, no background timers).
- `authIdentity.service.ts` — does the actual resolve work this cache is fronting.
- `../configuration.ts` — defines the `IDENTITY_CACHE_*` environment variables.
