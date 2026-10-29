# Identity Cache

`identityCache.service.ts` is a cache that sits in front of `AuthIdentityService.resolveOrDefault`.

## The problem it solves

Resolving a user's identity from their auth token is expensive: verifying the JWT signature, looking up the user in the database, and writing a `lastLogin` timestamp. Without a cache, this full process runs on **every single request**, even if the same user made a request a second ago with the same token.

## How it works

1. A request comes in with a token. `IdentityCacheService.resolveOrDefault(token, providerId)` is called instead of going straight to `AuthIdentityService`.
2. The token is hashed (SHA-256) and used as a cache key — the raw token is never stored.
3. **Cache hit:** the cached groups, user info and permissions (`accessMap`) are returned immediately. The `accessMap` is calculated for that user on the cache miss and stored in their own entry; nothing is shared between users. Every request with that token gets the same stored objects, so they are frozen: treat them as read-only.
4. **Cache miss:** the full resolve runs against `AuthIdentityService`, and the result is stored in the cache before being returned.

Both the REST API (`AuthGuard`) and the Socket.io connection handshake use this same cache.

## Always on

The cache is always on; there is no setting to switch it off. Requests without a token (anonymous) are never cached and always go straight to `AuthIdentityService`. With the cache on, a user's `lastLogin` is updated once per cache entry (at most every `IDENTITY_CACHE_TTL_MS`) instead of on every request.

## Cache entries always expire

Every cached entry has a TTL (time-to-live), set by `IDENTITY_CACHE_TTL_MS` (default: 5 minutes). The cache also never serves an entry past the token's own expiry — whichever comes first wins.

Expired entries are removed when they are next looked up, and by a sweep of the whole cache that runs at most once per TTL (triggered by the next insert; there are no background timers). That keeps the cache down to roughly the tokens seen in the last couple of TTL windows. `IDENTITY_CACHE_MAX_ENTRIES` (default 50,000) is only an emergency cap: if it is ever reached, the oldest entry is evicted.

## Cache entries are also cleared early, when needed

Waiting for the TTL isn't always good enough — some changes need to take effect right away:

- A User document is created, edited or deleted through a change request (e.g. from the CMS) → `ChangeRequestService` clears the whole cache. This covers group membership, `email` and `providerId` changes, and new users.
- Any group changes — its permissions (ACL) are edited, or a group is created or deleted → the whole cache is cleared, since every cached `accessMap` was built from the old groups.
- A user loses a group, or is deleted → the change feed's DeleteCmd also clears the whole cache, so revocations apply even when made outside the API.
- An auth provider or group-mapping rule changes → the whole cache is cleared (via the change feed).
- The database connection drops or comes back → the whole cache is cleared (we can no longer trust it's up to date).

This is a coarse invalidation — one change clears everyone's cached identity, not just the affected user's. That's a deliberate interim trade-off: safe, and fine while user and group changes are rare (days or weeks apart), but a busy system with frequent permission changes would see a lower cache hit rate. Clearing only the affected users is a planned improvement.

A request that is already resolving when the cache is cleared does not store its result, since it may have read the data from before the change.

### Why User edits aren't picked up from the change feed

Resolving an identity writes the user's `lastLogin` to their User document. On the change feed that write looks exactly like an admin edit, so clearing on every User update would mean every cache miss clears the cache. Admin edits are the only User changes that come through change requests, so that is where the cache is cleared.

The consequence: a User document edited outside the API (directly in CouchDB), or on another API instance, is only picked up when the entries expire — except removals and deletions, which also arrive via the feed. Pick `IDENTITY_CACHE_TTL_MS` with that window in mind.

## Related files

- `boundedTtlCache.ts` — the underlying generic cache (expiry sweep + emergency cap, no background timers).
- `authIdentity.service.ts` — does the actual resolve work this cache is fronting.
- `../endpoints/changeRequest.service.ts` — clears the cache after an accepted User change request.
- `../permissions/permissions.service.ts` — builds each user's `accessMap` from the group graph.
- `../configuration.ts` — defines the `IDENTITY_CACHE_*` environment variables.
