# HybridQuery: execution, hydration and ISR responsibilities

Status: design assessment with the first internal-refactor phase implemented.
The broader behavioral proposals below remain deferred, not an accepted ADR.

## Implemented scope

The implementation is restricted to shared-library internals and documentation.
All existing app, CMS, SSG and API consumers remain unchanged. New capability
contracts are internal; the existing class, composables and helper exports are
compatibility entry points.

Implemented: explicit source/coverage/cache/persistence dependencies; a plain query
session for execution lifetime; a result window composing the existing seed policy;
pure planning helpers; a storage-independent cache codec and synchronous adapter.
The cache key and wire format, initial seed timing and legacy completion/error
behavior are preserved.

Deferred: public composition APIs, consumer/SSG migration, pagination, strict HTTP
outcomes, new coverage states, cache identity/version changes, abort/retry policies,
ordering fixes and subscription-lifetime optimization. The recommendations in the
assessment describe follow-up work; they are not additional scope for this refactor.
Date: 2026-09-15.

## Finding

Use composition with explicit contracts. The important boundaries are query execution,
seed-to-live presentation, and route dependency capture. Extracting the existing class
into files without separating those responsibilities would preserve the regression risk.

SSG is not simply a remote-only HybridQuery consumer. During rendering,
`useContentQuery` bypasses the class, but depends on its transport helpers, cache key,
cache format and the browser class's seed replacement behavior. That is the coupling
to address first.

## Verified current flow

1. `routeEnumeration.ts` drains public content using `queryDrain.ts`'s
   `(updatedTimeUtc, _id)` keyset. The build publishes that corpus in memory through
   `__SSG_CONTENT_CORPUS__`; it is not the browser's IndexedDB or localStorage.
2. `useContentQuery` resolves corpus-compatible render queries against that corpus.
   An empty match is authoritative: falling back to a newer API result could create
   a link to a slug the build did not enumerate. Queries outside that coverage use
   `queryRemote`; no available corpus also permits remote fallback.
3. Each render records selector facets and returned parent/document dependency keys
   for its route. These feed `ssg-deps.json`; route, document-facet and deletion
   sidecars provide additional information for downstream regeneration.
4. Cache-enabled render queries write `{ local: docs, remote: [] }` using shared's
   response-cache helpers. The build embeds the route's exact `hqcache:*` entries in
   an inline script, which writes localStorage before the browser module boots.
5. The browser initializes the normal shared data layer and calls HybridQuery. Its
   synchronous seed read supplies the initial view; subsequent local and remote
   results replace that seed. The web browser has the same local-first query path
   as the SPA, although the web build has no service worker.

The deployment repository owns polling, selecting affected routes, scoped rebuilds,
upload and cache purge. It was not available for this assessment; its actual retry
and checkpoint behavior is not verified here. Browser response-cache entries are not
the ISR dependency ledger in this checkout.

## 1. What constitutes a completed query?

There are several distinct milestones; one `isFetching` flag cannot describe them.

| Consumer / operation | Current behavior | Proposed contract |
| --- | --- | --- |
| Browser initial query | Local and required remote work settle; offline deferral also clears remote pending. Cached output can exist before this. | Report activity and coverage separately. A deferred remote source means idle with incomplete coverage, not an authoritative empty result. |
| Browser live query | Continues until disposed; query changes start a new generation. | Each generation has a finite initial execution; its live subscription has a separate lifetime. |
| Hydration | A synchronous cache read supplies first paint; seed retention controls replacement. | First paint is satisfied when the render seed is synchronously available. Revalidation completes only after a source outcome suitable for replacement. |
| SSG page query | `onServerPrefetch` awaits corpus/remote resolution, cache writing and dependency reporting. Dependent queries are serialized per route. | Required query executions and required route artifacts must succeed before the render session reports success. Successful empty results are valid. |
| SSG corpus drain | Continues through pages; a short nonempty page gets an extra probe. Unexpected further results cause rejection. | Explicit exhaustion of all required sources. A per-query limit is not corpus completeness. |
| ISR build | Emits HTML and sidecars; query-failed diagnostics fail by default, with `SSG_STRICT=0` as an override. | The build reports usable artifacts only after required render work succeeds. Publication/checkpoint ownership remains downstream. |

Coverage is relative to a declared query window and corpus. A successful read over an
incomplete offline cache is not proof of global absence. Likewise, a drained corpus
is a fixed input once collected, but the live database drain is not a transactional
snapshot of all records at one instant.

## 2. Who owns retries, cancellation and disposal?

### Current ownership

- HybridQuery owns query generations, dependency watchers, local live-query scopes,
  socket listeners and a reconnect watcher. Vue scope disposal calls `dispose()`;
  imperative callers must call it themselves.
- Generation guards ignore obsolete responses; they do not abort HTTP requests.
  `HttpReq` exposes no AbortSignal, deadline or retry policy.
- Offline remote work waits for connectivity once. Socket reconnect reattaches
  listeners but does not re-fetch already completed remote results to heal gaps.
- Shared reference queries and the pending-edit subscription live for the process
  lifetime by design.
- SSG owns route chains and cache capture. The build releases each route's chain and
  captured cache after serialization. `buildOnce` memoizes requests and evicts a
  rejected promise so a later route can try again; it is not a bounded retry loop.
- The enumeration transport rejects HTTP failures but has no explicit cancellation,
  deadline or retries.

### Recommended ownership

| Owner | Responsibility |
| --- | --- |
| Query execution/session | Own generation, source tasks, result acceptance and cancellation signal. Ignore late responses even if a source cannot abort. |
| Source adapter | Honor cancellation where possible, validate responses and report typed outcomes. Own only its request/cursor resources. |
| Environment policy | Choose bounded retries, deadlines and reconnect refresh rules. Retry failed source work without duplicating successful page consumption. |
| Vue adapter | Create/dispose the browser session with the component; expose reactive state. |
| Application scope | Own deliberately shared reference queries and release them at application teardown. |
| Render/build session | Own dependent query ordering, build-wide memoization, route capture, timeout and cleanup on success or failure. |
| Deployment runner | Own rebuild scheduling, publication retries and ISR checkpoints. |

Do not place retries inside both sources and coordinators: multiplied retries and
unclear ownership would recreate the same coupling.

## 3. How are partial results and source failures represented?

### Gaps in the current contract

- HybridQuery exposes `output`, `isFetching`, one `error`, and pending-edit lookup.
  It has no explicit coverage, provenance, per-source failures or exhaustion state.
- Remote fan-out retains successful branches and only sets `error` if all branches
  reject. Callers cannot distinguish that partial success from full success.
- A one-shot local error sets `error` and supplies `[]` to continue routing. A live
  local error can leave the local pending flag set indefinitely.
- `HttpReq` catches network and JSON failures and returns undefined for HTTP errors.
  `queryRemote` converts an absent response to `[]`. Consequently, these failures
  can look successful to both HybridQuery and SSG's render diagnostics. Strict SSG
  error reporting only catches failures that actually reject.
- The enumeration transport rejects HTTP/JSON errors, but still treats a parsed
  response without `docs` as `[]`; response validation belongs at the source boundary.
- An SSG query rejection is reported and rethrown. Its fetching flag is cleared only
  on success, unlike a future explicit terminal failure outcome.

### Proposed result model

Illustrative contract, to refine before implementation:

```ts
type SourceOutcome<T> =
    | { status: "success"; docs: T[]; coverage: "complete" | "partial";
        next?: unknown; exhausted: boolean }
    | { status: "deferred"; reason: "offline" }
    | { status: "failed"; error: QueryError }
    | { status: "cancelled" };
```

The session retains outcomes by source ID, including each fan-out source. It derives
activity (`running`, `idle`, `disposed`) and aggregate coverage (`complete`, `partial`,
`unknown`) without using document count as a substitute for either. Successful empty,
failed, deferred and cancelled remain different outcomes. Continuation tokens must
be opaque to consumers and validated against their source/query identity.

Seeded/stale display data belongs to presentation state, separate from source truth:

- Browser policy may show a matching seed or previous result while revalidating and
  retain it on a recoverable failure, with an appropriate freshness indication.
- SSG policy rejects missing required outcomes; it must not silently emit an empty
  section because a request failed.
- Authorization changes invalidate incompatible seeds and sessions regardless of
  the no-flash policy. Preserve existing anonymous/authenticated separation during
  migration; do not treat that binary distinction as full query identity.

## 4. Which capabilities does each consumer need?

| Consumer | Execution/data | Presentation | Lifecycle and extra concerns |
| --- | --- | --- | --- |
| SPA content views | Dexie + coverage-based API supplement | Optional synchronous cache, previous result, field projection | Vue, local/socket updates, optional offline persistence and retention |
| Hydrated public web views | Same browser execution as SPA | Render-authored synchronous seed and controlled seed replacement | Same browser lifecycle; no ISR polling in the query |
| CMS synced lists/editors | Dexie, and supplements when coverage requires | Loading/error state; previous list during narrowing | Vue, live changes, optional pending-edit lookup; editable copies remain outside execution |
| CMS unsynced types such as User | Remote reads | Loading/error state | On-demand socket rooms; these result documents must not be persisted locally |
| Constant reference lists | Shared execution selected by type coverage | Optional first-paint cache | Explicit application lifetime, deduplication of subscriptions |
| Imperative lookups | Explicit local or remote read | Usually none | Awaitable result, cancellation/deadline; no automatic live subscription |
| SSG page rendering | In-memory corpus; permitted remote reads outside coverage | Serialize compatible seed, apply render field projection | Route dependency capture, prefetch dependency ordering, strict failure policy |
| SSG enumeration | Paged anonymous remote reads | None | Exhaustion checks, bounded build lifetime, route/corpus consistency |
| Downstream ISR runner | Change processing and generated sidecars | None | Route invalidation, deletion handling and publication; external implementation unverified |

The SSG corpus source is a first-class source with a coverage contract. An empty
covered result must not automatically invoke a fallback source. SSG requires neither
Dexie initialization nor socket subscriptions nor pending-edit watchers to render.

## Composition and regression boundaries

### Shared query semantics and execution

Own selector normalization, agreed sort/identity semantics, source outcomes, merge
rules and request generation safety. Take explicit dependencies; do not import Vue,
browser globals or application configuration. Browser coverage planning and build
corpus planning can be separate implementations of the same plan contract.

### Hydration protocol and presentation

Provide a shared, versioned seed encoder/decoder and identity contract consumed by
both SSG serialization and browser hydration. Storage and HTML embedding are adapters.
Keep synchronous seed decoding on the browser's initial execution path; lazy loading
it after the first render would violate the contract.

Treat the rendered window as a seed, with provenance and projection metadata, rather
than pretending it was freshly read from the browser's local source. The existing
`{local, remote}` format must remain supported during migration because deployed HTML
and client code can belong to different builds.

Keep a separate presentation reducer for seed, refreshing, refreshed and failed
transitions. `SeedRetention` is an existing starting point, but callers currently
control its meaning through the class's pending flags and source buckets. A seed
must be replaceable by a fuller document even when ID and update timestamp match.

### Render dependency capture

Consume the effective query and accepted result in an explicit route context. Record
selector dependencies even when a successful result is empty: a later insert can
make that route nonempty. Returned-document IDs alone cannot catch that change.
Preserve per-route attribution even when the query fetch is shared across routes.

Capture should return route artifacts without depending on localStorage scraping or
global current-route state. Storage bridges may remain at the build integration edge.
Capture failure is a required render-artifact failure, not an optional analytics error.
Empty results short-circuited before execution need a deliberate dependency rule.

### Separate sessions composed from these pieces

```text
Browser session: source plan → execution → presentation → Vue
                                              ↑
                                     synchronous seed reader

Render session: corpus/remote plan → execution → rendered data
                                         ├── seed encoder
                                         └── route dependency recorder
```

An SSG-specific serialization or dependency change should affect its adapter and
protocol tests. A socket lifecycle change should affect browser live updates. A merge
or ordering fix legitimately affects both and needs shared semantic contract tests.

## Implementation sequence and evidence required

1. Pin existing hydration and ISR contracts before moving logic. Keep extraction and
   behavior fixes in separate changes so regressions can be attributed.
2. Extract transport outcomes and a storage-independent seed codec. Preserve public
   APIs and the current seed format through compatibility adapters. Correct silent
   failure handling as an explicit behavioral change, with tests of the real HTTP path.
3. Compose a render session using the existing corpus source, explicit route capture
   and shared seed codec. Remove the render path's need to import the full browser class.
4. Extract browser execution and presentation ownership while preserving HybridQuery
   and composable facades. Move pending-edit lookup to an optional capability.
5. Add page readers and a pagination coordinator only after completion, failure and
   ordering contracts are explicit. Cursor state must never come from a display seed.

Acceptance coverage:

- First browser output is available synchronously; seed survives the intended
  cold-cache handoff; authoritative empty replaces it; failed fetch does not become empty.
- A fuller document replaces a stripped seed at an unchanged ID/timestamp.
- Cached sort boundaries agree across corpus, local and remote execution; multi-field
  sorts and equal primary keys require explicit checks (implementations currently differ).
- Anonymous/authenticated seed separation and identity-change invalidation hold.
- An authoritative empty corpus match never falls back remotely.
- Every route receives its own dependencies and seed, including build-shared reads,
  ordinary empty matches and dependent parent/child queries.
- HTTP failure, malformed response, partial fan-out and cancellation are distinguishable.
- Build failure releases session resources; browser disposal prevents late mutation.
- A browser-only feature change passes hydration protocol tests without modifying SSG code.

## Evidence and verification limits

Principal sources:

- [Content query seam](../app/src/composables/useContentQuery.ts)
- [SSG corpus source](../app/src/ssg/contentStore.ts)
- [Enumeration transport](../app/src/ssg/routeEnumeration.ts)
- [Corpus drain](../app/src/ssg/queryDrain.ts)
- [Dependency capture](../app/src/ssg/dependencyCapture.ts)
- [Per-route query chains](../app/src/ssg/ssrChains.ts)
- [Build hooks and sidecars](../app/vite.config.web.ts)
- [Browser HybridQuery](../shared/src/util/HybridQuery/HybridQuery.ts)
- [Seed retention](../shared/src/util/HybridQuery/seedRetention.ts)
- [Response cache](../shared/src/util/HybridQuery/responseCache.ts)
- [Shared HTTP helper](../shared/src/api/http.ts)

Existing tests inspected include `hydrationContract.spec.ts`,
`useContentQuery.ssr.spec.ts`, `contentStore.spec.ts`, `queryDrain.spec.ts`,
`dependencyCapture.spec.ts`, `seedRetention.spec.ts` and
`HybridQuery.seedShadow.spec.ts`.

The initial assessment could not run tests because dependencies were absent.
Dependencies were installed for implementation. Validation uses existing shared and
consumer unit tests, new isolated capability tests, the shared build and consumer
type-checks. Node 26 requires `NODE_OPTIONS=--no-experimental-webstorage` for jsdom's
Storage prototype to own quota-test behavior. Socket unit tests need permission to
bind their local test-server ports.

No E2E tests, network-backed SSG build or downstream ISR execution was run.
Performance and bundle savings remain to be measured.

Implementation verification:

- Full shared unit suite: 65 files, 1,387 tests passed, including 10 new capability tests.
- App SSG/content-query checks: 15 files, 112 tests passed with existing snapshots unchanged.
- CMS query/composable checks: 15 files, 167 tests passed.
- Shared build and app/CMS type-checks passed.
- Changed TypeScript files passed ESLint and Prettier checks; `git diff --check` passed.
- No app, CMS, API, package manifest or lockfile edits were required.
