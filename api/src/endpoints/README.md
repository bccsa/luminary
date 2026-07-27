# Endpoints

REST endpoints exposed by the API: `changeRequest`, `query`, `ftsSearch`, `storageStatus`. All are gated by `AuthGuard`. See `api/CLAUDE.md` for the full architecture of each; this file documents the `/query` request-time guards in `query.controller.ts`, since they're easy to lose track of.

## `/query` request-time guards

`processPostReq` runs a fixed sequence of cheap, pre-execution checks before a Mango query ever reaches CouchDB. Each one exists to stop a specific failure mode; none of them are diagnostic-only — every check here either rejects a request or feeds the rate limiter.

1. **Rate-limit gate** (`rateLimiter.check`) — an identity already in backoff from prior expensive queries is rejected outright with `429` + `Retry-After`. No-op when `QueryRateLimiterService` is disabled.
2. **Epoch-cursor rejection** — `selector.updatedTimeUtc` with both `$lte` and `$gte` at `0` can never match a real document (timestamps are always `> 0`), but CouchDB still has to walk the chosen index before returning empty. A sync client with a corrupted/reset cursor could otherwise generate a full-index scan on every poll. This check runs even when `BYPASS_TEMPLATE_VALIDATION=true`, because it isn't schema validation — it's an invariant about what a valid query can ever match.
3. **`parentId` fan-out cap** (`countParentIdFanout`) — `QueryService` issues one CouchDB request per id in `selector.parentId.$in`, so an unbounded array is worse than the full scan it replaced. Sizes above `query.maxFanoutParents` (default 200) are rejected; sizes above `query.fanoutStrikeThreshold` (default 25) are allowed but immediately strike the rate limiter, since the cost is known before the query runs — no need to wait on post-hoc `execution_stats`.
4. **Schema/operator validation** (`validateQuery`) — the universal selector validator (shape, `limit` cap, `use_index` registry membership, operator allowlist, per-request language cap for non-CMS queries). Skippable via `BYPASS_TEMPLATE_VALIDATION` (dev/test only).

After the query executes, `classifyQueryCost` inspects `execution_stats` to decide if the query was expensive (docs-examined threshold or examined:returned ratio). An expensive query logs a `warn("Expensive /query", …)` line — `identifier`, `identity`, `reason`, the execution stats, `use_index`, and a `selectorFingerprint(body)` of the post-injection selector — and strikes the rate limiter (enforcement bites the *next* request from that identity, not this one). `execution_stats` itself is always stripped from the client response.

`body.identifier` is not used for dispatch — it's only a caller-supplied label carried into this log line and into rate-limit context (e.g. `"sync"` for app/CMS sync calls).

### Adding a new pre-execution guard

If you find another selector shape that's cheap to reject up front (known before `QueryService` runs), follow the pattern above: check it before `validateQuery`, throw `BadRequestException` for the reject case, and call `rateLimiter.recordStrike(identityKey)` for an allowed-but-costly case rather than waiting on `execution_stats`. Keep the check itself in `query.controller.ts` as a small pure function (see `countParentIdFanout`) so it's unit-testable without a DB.

Avoid adding fields here purely for logging/debugging an investigation — that kind of temporary diagnostic instrumentation tends to outlive the investigation it was added for. If you need to correlate an expensive-query spike with request shape, prefer extending `selectorFingerprint` (already computed on every expensive-query log line) over introducing a new ad-hoc context object.
