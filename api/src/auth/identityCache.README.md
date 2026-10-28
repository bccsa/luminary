# Identity Cache

`identityCache.service.ts` is a cache that sits in front of `AuthIdentityService.resolveOrDefault`.

## The problem it solves

Resolving a user's identity from their auth token is expensive: verifying the JWT signature, looking up the user in the database, and writing a `lastLogin` timestamp. Without a cache, this full process runs on **every single request**, even if the same user made a request a second ago with the same token.

## How it works

1. A request comes in with a token. `IdentityCacheService.resolveOrDefault(token, providerId)` is called instead of going straight to `AuthIdentityService`.
2. The token is hashed (SHA-256) and used as a cache key — the raw token is never stored.
3. **Cache hit:** the cached groups/user info is returned immediately. The user's permissions (`accessMap`) are not stored here — they come from `PermissionSystem`, which keeps its own memo per group set and drops it whenever the group graph changes, so permission changes are picked up instantly even on a hit. The memoised map is shared between callers, so it is frozen: treat it as read-only.
4. **Cache miss:** the full resolve runs against `AuthIdentityService`, and the result is stored in the cache before being returned.

Both the REST API (`AuthGuard`) and the Socket.io connection handshake use this same cache.

## Off by default

The cache is only enabled when `IDENTITY_CACHE_ENABLED=true` is set; any other value leaves it off. When disabled, every call passes straight through to `AuthIdentityService` — same as if the cache didn't exist.

## Cache entries always expire

Every cached entry has a TTL (time-to-live), set by `IDENTITY_CACHE_TTL_MS` (default: 5 minutes). The cache also never serves an entry past the token's own expiry — whichever comes first wins.

Expired entries are removed when they are next looked up, and by a sweep of the whole cache that runs at most once per TTL (triggered by the next insert; there are no background timers). That keeps the cache down to roughly the tokens seen in the last couple of TTL windows. `IDENTITY_CACHE_MAX_ENTRIES` (default 50,000) is only an emergency cap: if it is ever reached, the oldest entry is evicted.

## Cache entries are also cleared early, when needed

Waiting for the TTL isn't always good enough — some changes need to take effect right away:

- A user's group membership changes (they gain or lose access to something) → the whole cache is cleared.
- A User document is created, or its `email` or `providerId` changes → the whole cache is cleared, since those decide which groups a token resolves to. A user's first login backfills `providerId`, so it clears the cache once.
- A user is deleted → the whole cache is cleared, so their now-invalid access stops working immediately.
- An auth provider or group-mapping rule changes → the whole cache is cleared.
- The database connection drops or comes back → the whole cache is cleared (we can no longer trust it's up to date).

This is a coarse invalidation — one change clears everyone's cached identity, not just the affected user's. That's a deliberate simplicity trade-off: safe, but it does mean a busy system with frequent membership changes will see a lower cache hit rate.

A request that is already resolving when the cache is cleared does not store its result, since it may have read the data from before the change.

## Multi-instance note

If the API runs as multiple instances, User changes made on one instance (a membership addition, a new user, an `email` or `providerId` change) only reach the others once their entries expire. Removals and deletions propagate immediately everywhere, since they also go through the shared database change feed. Pick `IDENTITY_CACHE_TTL_MS` with that window in mind.

## Related files

- `boundedTtlCache.ts` — the underlying generic cache (expiry sweep + emergency cap, no background timers).
- `authIdentity.service.ts` — does the actual resolve work this cache is fronting.
- `../permissions/permissions.service.ts` — owns the `accessMap` projection and its memo.
- `../configuration.ts` — defines the `IDENTITY_CACHE_*` environment variables.
