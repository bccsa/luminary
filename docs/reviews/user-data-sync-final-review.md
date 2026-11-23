# User-data sync: final review

This is Review Phase 5, covering performance and regressions after Review Phases 1–4.
The original live-update, quota and tombstone-cleanup features remain deferred.

## Original review comments: verification

Checked against the current working tree and freshly fetched `origin/main` (`56f1c5c5`).
The original requested implementation changes are present; the open pagination finding below
is separate from those comments. Review Phase 5 changes are still uncommitted.

| Review request                                                        | Verified implementation / decision                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse the document base instead of repeating common fields            | `_baseDocumentDto` holds `_id` and `type`; both `_baseDto` and `BaseUserActivityDto` extend it. Shared DTOs mirror the activity contract without group metadata.                                                                                                                                            |
| Separate DTOs identified by `type`                                    | Viewed, liked and highlighted DTOs form a discriminated union. Current documents have no `activityType`; that field remains only in legacy compatibility code.                                                                                                                                              |
| Enum validation                                                       | Dedicated `UserActivityType` and `UserActivityColor` enums are present in API and shared code.                                                                                                                                                                                                              |
| Shorter UUID ids without a type prefix                                | Current activity ids are deterministic UUID v5 values bounded to 36 characters. Prefixes remain only in the legacy adapter. Parent/content references retain a 512-character bound for existing non-UUID content ids.                                                                                       |
| Align `authIdentity.service.ts` with main and consider session tokens | Auth guard and identity-cache implementation match fetched main. The identity service retains the branch's provider-unavailable classification. Main still resolves provider JWTs, so no separate session-token implementation is assumed. Authorization/rate limits consume the resolved account identity. |
| Move owner authorization into `auth`                                  | `auth/ownerKey.ts` and its tests live under authentication. Issuer/subject HMAC ownership stays stable across refreshes/sessions.                                                                                                                                                                           |
| Organize user indexes and content seed assets                         | Separate content/user design-doc folders and content seed folder are wired through loaders, registries and Nest build assets. All 100 moved JSON files match their original contents and compiled copies.                                                                                                   |
| Reconsider controller authentication checks                           | Change requests use `AuthGuard` and its resolved identity; anonymous rejection and account rate limits occur before multipart buffering. Controllers do not validate a second token/session format.                                                                                                         |
| Separate user change-request service and route in the controller      | `UserChangeRequestService` owns user writes; JSON/multipart dispatch happens in `ChangeRequestController`. Shared `ChangeRequestService` has no user-data dependency.                                                                                                                                       |
| Review custom error handling                                          | Validation still returns final rejected acknowledgements; stale uploads return the stored document. Storage/source failures intentionally remain retryable HTTP errors, preventing queue loss. Shared validation messages remain preserved.                                                                 |
| Split user/shared query controllers and extract common logic          | `UserQueryController` serves `/user/query`; `/query` keeps shared reads and legacy source dispatch. `QueryRequestService` shares validation, rate limits, cost reporting and response cleanup.                                                                                                              |
| Singleton nano connection and performance                             | One initialization promise/client/handle per user DB service; cached index registries, partitioned queries, indexed pending-ID lookups and conflict re-reads. Operation-count/concurrency checks pass. Live throughput is not measured.                                                                     |

The legacy format, longer content-reference bound and `/query` compatibility dispatch are
intentional compatibility decisions. They are not incomplete removal of the current activity
format's `activityType` or prefixed ids. Future session-token and live-load validation remain
follow-up work rather than implemented guarantees.

The fresh original-comment check passed 240 mocked tests across 15 suites, including auth
identity/guard/cache, owner keys, DTOs, user storage, query routing and change-request dispatch.
The API/shared identity helpers were also compared directly and match after imports.

Manual startup checks subsequently confirmed API HTTP responses, public language retrieval,
anonymous user-query rejection (401), the socket handshake and user-source advertisement.
The repository owner confirmed the app finishes loading. These checks do not establish
authenticated cross-device convergence or live-load performance.

## Corrections

- Source pulls now check pending edits through the `localChanges.docId` index, fetching only
  matching keys. They no longer deserialize every queued document to protect an incoming page.
  The check and incoming writes remain in the same transaction. A backlog regression confirms
  pending edits are preserved while unrelated remote documents are imported.
- Activity-format migration now queues the same winning document it retains in local storage.
  Previously, an equal-time or newer stored tombstone could win locally while a live document
  remained queued, allowing an upload to undo the retained removal. Regressions cover both
  equal/older queued copies and equal-time queued duplicates.

## Request cost and concurrency

- The user database remains a Nest singleton with one initialization promise, nano client and
  database handle. Initialization and asset loading are outside the enabled request path.
- Owner queries use partitioned reads and cached index registries. Content and user indexes,
  local databases, pending changes and sync cursors remain separate.
- Mocked operation-count checks cover 100 writes and 100 partitioned reads using one client.
  An uncontended write takes one revision read and one insert. Stale/identical retries skip
  inserts. Conflict retries re-read the current document; concurrent same-document writes
  retain the latest activity timestamp. Exhausted retries propagate as retryable failures.
- No activity-document cache was added: a cache could miss writes made by another API instance.
  These checks establish operation counts and behavior, not live CouchDB throughput or latency.

## Open finding: timestamp ties can omit documents

The existing generic sync cursor uses `updatedTimeUtc` alone. When a full page shares one
timestamp, repeating the same range can return the same page. The stall guard in
`shared/src/api/sync/syncBatch.ts` then marks the column complete without exhausting that
timestamp's documents. This behavior predates the review refactor.

A temporary mocked source probe reproduced the omission:

1. Provide three distinct documents, all with `updatedTimeUtc: 1000`.
2. Configure the source batch limit as two.
3. Answer each query with matching documents, sorted by timestamp and limited to two.
4. Pull the source. Only the first two documents reach its local store.

This is an unresolved correctness finding, not a passing convergence check. The temporary
probe was removed from the normal suite. Its result was:

```text
Expected ids: ["tie-a", "tie-b", "tie-c"]
Actual ids:   ["tie-a", "tie-b"]
```

The follow-up needs stable tie-breaker pagination and owner-safe continuation across API and
client versions. Cursor persistence, cancellation, interrupted pulls and applicable indexes
must be checked together. Increasing the page limit only moves the failure threshold.
No pagination protocol change was made during this final review.

## Verification limits

The final normal suites passed:

| Package | Passing tests | Scope                                                 |
| ------- | ------------: | ----------------------------------------------------- |
| App     |         2,170 | Full unit suite; one additional test skipped          |
| Shared  |         1,525 | Full unit suite, including source backlog protection  |
| CMS     |         1,224 | Full unit suite with temporary local test servers     |
| API     |           274 | Selected mocked suites plus JSON/multipart HTTP tests |

API/app/CMS type checks and lint on changed code passed. The timestamp-tie probe is a
separate failing diagnostic, described above; it is not counted as passing here.

Shared, API, app and CMS production builds passed. The CMS build initially failed because
`VITE_LOGO_FAVICON` was unset; rerunning that command with
`VITE_LOGO_FAVICON=src/assets/favicon.png` (from its `.env.example`) passed. No `.env` file
was changed. Existing CSS compatibility and bundle-size warnings remain.

Automated verification uses unit suites, mocked API services, temporary local test servers,
package builds and type checks. CouchDB/S3-backed tests, browser E2E and live load measurements
remain owned by the repository user. Passing these suites does not resolve the timestamp-tie
finding. Manual account-sync checks remain listed in `temp_user-data-sync-plan.md`.
