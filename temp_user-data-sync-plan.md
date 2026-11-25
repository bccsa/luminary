# User data sync — implementation plan

> **Temporary working doc** (`temp_` prefix, see "Development docs" in the root `CLAUDE.md`). Do not reference it from code, comments or tests. When the feature ships, promote the durable parts into an ADR and delete this file.
>
> Written against `main` at `d4fce7cc` (12 November 2026). Code is referenced by file and symbol; line numbers are deliberately left out because they drift.

## Progress — 18 November 2026

- **Phase 0:** implemented, with follow-up fixes for upgrades from the earlier migration,
  remote resolution of missing content, and retry after offline/failed lookups. The passage
  migration uses its own completion marker and removes the legacy key when finished.
- **Phase 1:** implemented, with follow-up fixes for durable per-page cursors, stalled queue
  restart on pull/flush/foreground, default `syncActive` isolation, atomic local edits and
  incoming writes, and safe clearing of in-flight source work. Named databases share upgrade
  handling and have regression coverage for schema/cursor isolation. The interrupted-pull
  regression now exercises the real sync engine across a database reopen.
- **Phase 2:** implemented after Phase 3. The API has a standalone, optionally configured
  partitioned store, HMAC owner authorization, a separate DTO and index registry, endpoint
  dispatch, activity-time merging with conflict retries, and source capability advertisement.
  Startup leaves the source off when configuration, the partitioned database or design-doc
  initialization is unavailable. Provisioning is available through `setup-dev.sh setup-user-data`
  and documented for ops. Validation failures are HTTP 200 acks; unavailable storage remains
  a retryable HTTP error. Default-source routing and response statuses are preserved.
- **Phase 3:** implemented. Activity opens and migrates before components mount in both
  builds, then reconciles its owner after auth before enabling transport. Store, highlight
  and recommendation readers use the source; UI dates use `activityTimeUtc`. Lost sessions
  retain data, different owners clear first, and explicit logout flushes/warns/clears with
  an offline guard. Signed-in clearing queues tombstones; signed-out clearing wipes locally.
  Progress backfill runs once per device to avoid recreating cleared or signed-out history.
- The durable architecture decision is recorded in ADR 0020.

Verification of these corrections: all 1,502 shared tests and 133 focused app tests
passed; the shared build, app type-check, and lint of changed TypeScript files passed.
Playwright and DB/S3-dependent API tests were not run.

Phase 3 verification: the full app suite passed (1,834 tests passed, one skipped), as did
its production SPA build, app type-check, changed-file lint and English/French seed validation.
Web startup and mounted-article refresh are covered by unit tests. Full prerender and two-browser
account sync remain unverified; Phase 2 is now available for the repository owner's integration checks.

Phase 2 verification: 198 mock-only API tests passed across 10 suites, including JSON and
multipart dispatch, owner isolation, conflict retries, source-off behavior and advertisement.
The API type-check and production build passed; the user-data design document was verified in
the built assets. Changed-file lint and shell syntax checks passed. Provisioning was checked
with fake HTTP responses for new/existing partitioned databases, a plain database, an invalid
name and an authorization failure; no database was contacted. Shared regressions passed (49
batch-sync, 10 data-source and 20 queue tests), plus all 7 app source-lifecycle tests.
No `.env` values were changed or databases provisioned. CouchDB/S3-dependent API tests and
Playwright were not run; real partition/index behavior and two-browser sync remain owner-run checks.

## 1. Summary

User activity — what a user viewed, liked and highlighted — lives only on the device today, in the `userActivity` table of the `luminary-db` IndexedDB database. It should follow a signed-in user across devices.

The approach is to reuse the existing sync engine and change-request queue against a second **data source**:

- **Client:** a new local IndexedDB database, `luminary-user-db`, holding the activity docs, their outbound queue and their own sync cursor.
- **Server:** a dedicated CouchDB database, partitioned per user.
- **Wire:** the existing `POST /query` and `POST /changerequest` endpoints, with an optional `dataSource: "user"` field. With no field, both behave exactly as today.
- **Security:** an owner rule. A user reads and writes only their own docs. The group/ACL permission system is not involved.

The work is four changes (Phases 0–3), followed by two later phases (4–5). Implementation proceeds through 0, 1, 3, then 2; capability gating keeps the app local until the API source is available. All decisions in section 3 are settled with the product owner; section 4 lists alternatives already ruled out.

## 2. Terms

| Term | Meaning |
|---|---|
| Data source | A named bundle the sync engine can run against: a local database, its sync cursor and a name sent on the wire. The default source is today's `luminary-db` and the shared dataset. |
| Owner key | The server-side identifier of a user's data: a keyed hash of the token's issuer and subject. Never sent to or stored on the client. |
| Activity doc | One document per activity: one per liked post, one per viewed post, one per highlighted passage. |
| Tombstone | An activity doc with `deleted: true`. Undoing an activity writes a tombstone instead of deleting, so the removal itself syncs. |
| Queue | The `localChanges` table: outbound changes waiting to be sent as change requests. |
| Pull | One run of the sync engine for the user data source, fetching docs newer than its cursor. |

## 3. Decisions

### Identity and storage

| Decision | Detail and reason |
|---|---|
| Owner key | `HMAC-SHA256(USER_DATA_ID_SECRET, iss + "\n" + sub)`, hex. Both claims are in the verified `request.user.jwtPayload` on every authenticated request, including for the majority of users who have no User doc. The database stores no email or subject. Two AuthProvider docs on the same issuer resolve to the same user. |
| Secret | A new dedicated `USER_DATA_ID_SECRET`, separate from `ENCRYPTION_KEY`, so rotating the latter never touches user data. It must be backed up and never rotated. |
| Database | A dedicated CouchDB database, **partitioned** by owner key. Stored `_id` is `<ownerKey>:<clientDocId>`. The API adds the prefix on write and strips it on read; clients never see it. Queries run inside the caller's partition, so the owner rule is enforced by the request path, not by a selector filter. |
| Provisioning | Staging and production run CouchDB 3.x. The database is **created by ops**, not by the API. The API applies the design docs at startup, as it does for the main database. |
| Wire contract | An optional `dataSource` field on the existing `/query` and `/changerequest`. No new endpoints. |
| Capability | The API lists the sources it serves in the socket `clientConfig` message (`dataSources: ["user"]`). The client sends user-data requests only when `"user"` is listed. This is the feature switch; there is no app build flag. See section 4 for why it is needed. |
| Rate limit | The change-request limiter is keyed per signed-in user when there is no User doc, instead of per IP. |

### What syncs

| Decision | Detail and reason |
|---|---|
| Scope | The `userActivity` data only: likes, highlights and viewed rows. Resume position (`contentProgress` in localStorage) and preferences are device-local navigation state and are **not** synced. |
| Viewed | Viewed rows sync in full, including the once-a-minute refresh while reading or watching. Only the fact and time of viewing leaves the device. |
| Highlights | **One doc per highlighted passage**, id `highlighted:<contentId>:<start>-<end>`. The legacy `luminaryInternals["highlights"]` store is removed completely. |
| Merge rule | Per document: the copy with the later `activityTimeUtc` wins. A device uploads all its unsent activity; an older copy never overwrites a newer one. |
| Clear activity | Signed in, it clears the whole account: every row the device holds becomes a tombstone and is uploaded. Signed out, it wipes the local copy. |
| Builds | Both the SPA and the prerendered web build sync. |

### Sign-in, sign-out and consent

| Decision | Detail and reason |
|---|---|
| Consent | Sync runs only while the user is signed in **and** the privacy policy status is `accepted`. Otherwise activity stays local and queued. There is no separate setting. |
| Signed-out use | Activity is recorded locally and merged into the account at sign-in, so a user does not lose history made before signing in. |
| Sign-out | Blocked while offline, enforced inside the sign-out function so every caller is covered. Online, the queue is uploaded for a few seconds; if anything is still unsent, a confirm dialog warns before it is lost. Then the device copy is removed. |
| Session lost | When a session ends without sign-out (refresh rejected, provider not found), the activity stays on the device, tied to that user, and uploads when they sign back in. If a **different** user signs in, it is cleared first. |

### Delivery

| Decision | Detail and reason |
|---|---|
| First upload | Existing history is uploaded in full, paced to a few requests per second while a backlog is queued; likes and highlights first, viewed last. |
| Order | Four separate changes: Phase 0, 1, 3, then 2. Capability gating keeps user-data transport off until the API supports it. |
| Later | Live updates (Phase 4); per-user quota and tombstone clean-up (Phase 5). Device authorization is a design seam only. |

## 4. Alternatives already ruled out

These were considered and rejected; please do not revisit them without new information.

| Alternative | Why not |
|---|---|
| New endpoints (`/userdata/...`) | The product owner wants one change-request mechanism with a data-source field. |
| `dataSource` field **without** the `clientConfig` capability | An API that predates this feature answers a `userActivity` change request with an ordinary `rejected` ack ("Invalid document type", from `validateChangeRequest`). The client treats a rejection as final and removes the change from its queue, so that activity would never upload, even after the API is upgraded. Advertising support means nothing is sent to an API that would mis-handle it. |
| An app build flag | Replaced by the capability above; the server's configuration is the switch. |
| Threading the source through all of `sync()` | Everything `sync()` adds on top of `syncBatch` — group, language and publish-date column splitting, DeleteCmd columns, trim — is a no-op for a single owner column. Threading it through would touch about 30 sites and also flip the global `syncActive` flag, which the app's language boot gate in `globalConfig.ts` reads. |
| Keeping the user column in the default `syncList` | `Database.reconcileSyncListToAccess` would trim the column away on every access-map change, and `liveSync` would request socket rooms for it. |
| Subclassing `DbService` for the second database | Its constructor starts an `include_docs` change feed and retries forever when the database is missing. A small standalone service leaves `DbService` untouched. |
| Adding `UserActivity` to the **API** `DocType` enum | Both shared-dataset paths already reject unknown types. Adding it would open a hole that then needs plugging. |
| A plain database with an `ownerId` field | Works, but isolation depends on an injected filter and queries span all shards. Cannot be converted to partitioned later without migrating data. |
| Email-based identity | Orphans data when an email changes, and the API does not check `email_verified`. |
| One highlight doc per article translation | Two devices highlighting the same article without syncing in between would overwrite each other's passages. |
| A single "newest timestamp" cut-off for the sign-in merge | Drops signed-out history whenever another device was used more recently. |
| Server merges highlight passages inside one doc | A removed passage could be resurrected from the other copy. |

## 5. How it works

**Writing an activity**

1. The app store writes through `source.db.upsert({ doc, overwriteLocalChanges: true })`. This stores the doc and queues exactly one outbound change per doc id.
2. When the source is ready (connected, enabled by the app, advertised by the API), the queue is sent with the existing `getRest().changeRequest`, with `dataSource: "user"` added.
3. The API authenticates, rate-limits and parses as today, then hands the request to the user-data service. It validates the doc, prefixes the id with the owner key, and writes it unless the stored copy has a later `activityTimeUtc`. The server sets `updatedTimeUtc`.
4. The ack is handled by the existing `applyLocalChangeAck`:
   - `accepted`: the queue row is removed.
   - `rejected` with `docs` (the stored copy was newer): the local copy is replaced by the server's.
   - `rejected` without `docs` (validation failed): the queue row is removed and, in the source's quiet mode, the local doc is kept.

**Pulling**

1. `source.pull()` calls `sync()` with the source, which goes straight to `syncBatch`.
2. `syncBatch` posts to `/query` with `dataSource: "user"`, the `type` and `updatedTimeUtc` range selector, and `use_index: "sync-userActivity-index"`. It sends no `memberOf` selector.
3. The API runs the query inside the caller's partition and strips the id prefix.
4. Docs are written to the user database, and the cursor is persisted in that database's own `luminaryInternals["syncList"]`.
5. A pull never undoes an unsent edit: it does not run while the queue is non-empty, and a pulled doc that has a queued change is skipped.

**Pull triggers:** connect or sign-in, after the outbound queue empties, and when the app returns to the foreground. The pull after the queue empties is what brings back the server's copy of the device's own writes, with the server-set `updatedTimeUtc`.

## 6. Data model

`UserActivityDto` in `shared/src/types/dto.ts`, mirrored as a standalone class-validator class in `api/src/dto/UserActivityDto.ts`:

| Field | Set by | Notes |
|---|---|---|
| `_id` | client | `liked:<parentId>`, `viewed:<parentId>`, `highlighted:<contentId>:<start>-<end>` |
| `type` | client | `"userActivity"` |
| `activityType` | client | `viewed` / `liked` / `highlighted`. This is today's row field `type`, renamed because `type` is the doc type everywhere else. |
| `parentId`, `contentId?` | client | Unchanged from today. |
| `payload?` | client | Highlights only: one passage `{ range: { start, end, color, text } }`. |
| `activityTimeUtc` | client | When the activity happened. Orders and groups the activity pages and decides which copy wins a merge. The server caps it at its own clock so a wrong device clock cannot win forever. |
| `updatedTimeUtc` | server | The sync cursor. `DbService`-style: overwritten on every write. |
| `deleted?` | client | Tombstone flag. |

Why two timestamps: the sync engine walks docs by `updatedTimeUtc`, which the server must set. The activity pages order and group by the same field today, and migrated rows carry old or zero timestamps, so without a separate client timestamp the first round trip would re-date every activity to its upload time.

`DocType.UserActivity = "userActivity"` is added to the **shared** enum only (see section 4).

## 7. Where things are today

**shared (`shared/src`)**

- `db/database.ts`: the `Database` class is not exported and hard-codes the name `luminary-db`. It has five tables: `docs`, `localChanges`, `luminaryInternals`, `retention`, `userActivity`. The schema version is bumped automatically by comparing the index definition with `localStorage["dexie.dbIndex"]`.
- `Database.upsert` writes `docs` and queues `localChanges`. `Database.applyLocalChangeAck` handles acks; on a rejection without `docs` it **deletes the local doc**, and it pushes user-facing messages into the global `changeReqErrors` / `changeReqWarnings` / `changeReqInfo` refs.
- `api/sync/`: the engine keeps its cursor in a module-level `syncList` ref (`state.ts`). `syncBatch.ts` posts to `"query"`, always sends a `memberOf` selector, builds `use_index` as `"sync-" + type + "-index"`, and writes with the global `db.bulkPut`.
- `api/syncLocalChanges.ts`: drains the queue through `getRest().changeRequest` as multipart `LFormData`. It stops at a head item that fails three times and resumes only when the queue changes or the socket reconnects.
- `api/http.ts`: `HttpReq` returns `undefined` for every 4xx. Auth headers are module-global and apply to every instance.
- `api/RestApi.ts`: the constructor shows the pattern for wiring a queue — a `useDexieLiveQuery` over `localChanges` inside an `effectScope`, passed to `syncLocalChanges`.
- `socket/socketio.ts`: the `clientConfig` handler receives `{ maxUploadFileSize, accessMap }`.

**api (`api/src`)**

- `endpoints/query.controller.ts` validates with `validateQuery` and calls `QueryService.query`. `validation/query/validateQuery.ts` rejects unknown top-level keys (`ALLOWED_TOP_LEVEL_KEYS`) and accepts an `indexNames` override.
- `endpoints/changeRequest.controller.ts` rejects anonymous callers, rate-limits with the key `request.user?.userId ?? "ip:" + request.ip`, then parses multipart or JSON. `endpoints/changeRequest.service.ts` calls `processChangeRequest`.
- `auth/authIdentity.service.ts`: `JwtUserDetails.userId` is set only when a User doc matched. `jwtPayload` is always present for authenticated callers.
- `db/db.service.ts`: bound to one database. `db/db.seedingFunctions.ts` `upsertDesignDocs` caches the first `DbService` it is given and hard-codes the `designDocs` directory, so it cannot be reused for a second database.
- `socketio.ts`: emits `clientConfig` in the `clientConfigReq` handler.
- There is no server-side user-activity code today.

**app (`app/src`)**

- `userActivity/store.ts` is the only reader and writer of `db.userActivity`, apart from `userActivity/migrate.ts` and `userActivity/fromContentProgress.ts`, which write the table directly. Reactivity is a manual counter, `userActivityVersion`.
- Row ids are deterministic. Undo writes a tombstone. `viewed` is capped at 500 rows (`MAX_VIEWED`); tombstones are pruned after 90 days (`TOMBSTONE_TTL_MS`).
- `components/common/LHighlightable.vue` paints from and saves to `luminaryInternals["highlights"]`, then mirrors into a single `highlighted:<contentId>` row holding `payload.ranges`. `recommendation/highlightStore.ts` reads the same legacy store.
- `util/highlightRanges.ts`: `addHighlight` merges same-colour passages that touch and splits a passage when a different colour is painted over part of it. `anchorHighlights` re-anchors saved passages onto the current article text. Passages have no identity of their own.
- `globalConfig.ts` `initUserActivity` runs the start-up tasks. The web entry (`ssg/clientRuntime.ts`) never calls it.
- `auth.ts` `useAuth().logout` clears credentials, calls `db.purge()` (which deliberately leaves `userActivity` alone), then redirects. It has no offline check of its own. `ProfileMenu.vue` and `DesktopSidebar.vue` block sign-out offline before calling it; `PrivacyPolicyModal.vue` calls it directly in two places with no check.
- Signed-out users accumulate activity; nothing gates the like button, the highlighter or view recording on being signed in.

## 8. Phases

Build order when verifying locally is `shared` → `api` → `app`. A shared **type** change needs `npm run build` in `shared/` before the app's type-check sees it.

### Phase 0 — app: highlights as one row per passage

Device-only. It ships first so the shape changes while a local migration is enough and nothing needs cleaning up on a server.

1. `shared/src/types/dto.ts`: change the highlighted row's payload from `{ ranges: HighlightRange[] }` to one passage. Rebuild `shared`.
2. `app/src/util/highlightRanges.ts`, `components/common/LHighlightable.vue`:
   - **Load:** read this content's passage rows, replay them in activity-time order through the existing `addHighlight`, then re-anchor. Passages from two devices can overlap, which never happens on one device; replaying gives the result one device would have produced.
   - **Save:** compare the previous passages with the new list. Leave unchanged passages alone, tombstone the ones that vanished, add rows for new ones. Extending or partly recolouring a highlight is therefore remove + add.
   - Write the tidied-up set back only on the user's next edit, not on load, so two devices cannot ping-pong.
   - Make `parentId` a required prop. Its only caller, `SingleContent.vue`, always passes it.
3. `recommendation/highlightStore.ts`: `loadHighlightQueries` and `loadHighlightQueriesFor` read passage rows.
4. `userActivity/store.ts`: remove `dropStoredHighlight` and every write to the legacy store. Removing one passage tombstones its row.
5. `pages/Activity/ActivityHighlighted.vue`, `ActivityAll.vue`, `useHighlightColours.ts`: group passage rows by content.
6. `userActivity/migrate.ts`: a final migration, after which the `highlights` key is deleted.
   - Split existing `highlighted:<contentId>` rows into passage rows.
   - Convert remaining legacy-store entries, including the two legacy HTML-snapshot shapes.
   - Entries whose post is not in the local database were skipped by the earlier migration. Look those up remotely once, by content id.
   - If the device is offline, keep the key and retry on the next start. Entries still unresolved after a successful lookup are dropped with the key.
7. Specs: `highlightRanges` (diff; replay with overlaps), `LHighlightable`, `highlightStore`, `store`, `migrate`, the activity pages.

### Phase 1 — shared: data sources

No behaviour change for the default source. Existing specs must pass unmodified.

1. `types/enum.ts`, `types/dto.ts`: `DocType.UserActivity`, `UserActivityDto`.
2. `api/sync/types.ts`: a `SyncSource` object (`name`, `db`, `syncList`, `put`) and an optional `source` on `SyncBaseOptions`. Pass it as an object, not a registry key, so no new module state is introduced.
3. `api/sync/state.ts`: `syncListOf(source?)` returns the source's list, or today's global ref.
4. `api/sync/merge.ts` (`mergeVertical`, `mergeHorizontal`), `utils.ts` (`calcChunk`), `syncBatch.ts` (`markColumnEof`, the write, the list push): use the source when given. For a source, `syncBatch` adds `dataSource: source.name` to the query and omits the `memberOf` selector. The column keeps a constant placeholder `memberOf`, because sync-list validation requires a non-empty one; it is only the column's identity.
5. `api/sync/sync.ts`: one early return in `sync()` — a call with a source goes straight to `syncBatch`, with `includeDeleteCmds` off.
6. `socket/socketio.ts`: store the advertised `dataSources` in a ref; empty when the field is absent.
7. `db/database.ts`:
   - `Database` accepts a name. Share the open / blocked / versionchange handling between the default and named paths.
   - A named instance **must** namespace the `dexie.dbIndex` localStorage key. If two databases share it, each sees the other's index definition as a change, both bump their version on every boot, and the `versionchange` handler reloads visible tabs.
   - A named instance has no `userActivity` table, owns its sync list (used by `getSyncList` / `setSyncList`), skips `requestIndexDbPersistent`, and skips the default-only start-up work: expiry sweeps, the access-map watcher, FTS corpus stats.
   - Add `clear()` for sources; `purge()` stays default-only.
   - Add a quiet mode in which `applyLocalChangeAck` neither touches the global change-request message refs nor deletes the local doc on a rejection.
8. `api/syncLocalChanges.ts`: an optional target — `db`, `dataSource`, a `ready` ref, quiet, pacing. With pacing on, sends are spaced out while a backlog is queued.
9. New `api/dataSource.ts`: `createDataSource(config)` returning `{ db, pull(), flush(timeout), clear(), pending }`. It wires the queue using the `RestApi` constructor pattern, enforces the two pull rules from section 5, runs one pull at a time, and restarts a stalled queue on its next trigger.
10. Untouched: `liveSync`, `isSyncable`, `HybridQuery`, room subscriptions, `deleteRevoked`, `purge`, `trim`, `HttpReq`, `RestApi`.
11. Specs: `syncBatch` (`dataSource` sent, no `memberOf`, default unchanged), `merge` and `utils` (the two lists are isolated), `database` (two instances, `clear`, quiet ack), `syncLocalChanges` with a target and pacing, `dataSource` (not advertised means nothing is sent; an interrupted multi-page pull converges with no doc missed).
12. Docs: `src/api/sync/README.md`, and the table list in `shared/CLAUDE.md`, which is out of date. Keep shared docs generic — no references to the app or CMS.

### Phase 2 — API: user-data store behind the existing endpoints

Inert until configured: the source is served and advertised only when `DB_USERDATA_DATABASE` and `USER_DATA_ID_SECRET` are both set **and** the database exists.

1. `configuration.ts`, `.env.example`: the two settings.
2. Provisioning: add the creation command (`PUT /<db>?partitioned=true`) to `scripts/setup-dev.sh` and the API README. At startup the API checks that the database exists and is partitioned. If not, it logs a clear error and leaves the source off; it does not retry forever.
3. `auth/ownerKey.ts`: the HMAC helper that resolves the owner from `request.user.jwtPayload`. Anonymous callers get 401. Every user-data path goes through it; it is where a device check would go later.
4. `userData/userDataDb.service.ts`: a small standalone service.
   - A lazy `nano` handle on the user-data database.
   - Applies the design docs from its own directory. Do not reuse `upsertDesignDocs`.
   - `partitionedFind(ownerKey, query)`.
   - An upsert that reads the stored doc, keeps the stored copy when its `activityTimeUtc` is later, skips identical docs (`isEqualDoc`), sets `updatedTimeUtc`, and retries on conflict the way `DbService.insertDoc` does.
5. `db/userDataDesignDocs/sync-userActivity-index.json`, modelled on `db/designDocs/sync-user-index.json`. Add the directory to the `nest-cli.json` assets. The index name is fixed by how `syncBatch` builds `use_index`.
6. `userData/userData.service.ts`; register in `app.module.ts`; startup check and design docs in `main.ts`.
   - **Query:** require `type` to be `userActivity`, run in the caller's partition, strip the id prefix. It must accept `updatedTimeUtc` bounds of `0` and `Number.MAX_SAFE_INTEGER`; the engine sends both.
   - **Change request:** always answer with a `ChangeReqAckDto` over HTTP 200. A stale write returns `rejected` with the stored doc in `docs`. Never answer a bad doc with HTTP 4xx: `HttpReq` turns that into `undefined` and the client's queue stalls behind it.
   - **Validation:** `whitelist` without `forbidNonWhitelisted`, because docs carry `_rev` and `updatedTimeUtc`. The `_id` is length-capped and must start with its `activityType:`. Do not assume UUIDs; content ids such as `page-privacy-policy` exist. Cap the size of a passage's text. Cap `activityTimeUtc` at the server clock.
7. Edits to the shared-dataset path. These are the only ones:
   - `validation/query/validateQuery.ts`: add `dataSource` to `ALLOWED_TOP_LEVEL_KEYS`.
   - `endpoints/query.controller.ts`: when `dataSource` is `"user"`, validate with the user-data index names and hand off to the user-data service instead of `QueryService`. An unknown value is a 400.
   - `dto/ChangeReqDto.ts`: optional `dataSource`.
   - `endpoints/changeRequest.service.ts`: after the existing anonymous check, hand a `"user"` request to the user-data service.
   - `endpoints/changeRequest.controller.ts`: the rate-limit key becomes the User doc id, else a hash of the token's `iss` and `sub`, else the IP.
   - `socketio.ts`: `clientConfig` gains `dataSources: ["user"]` when the source is on.
   - A `"user"` request while the source is off gets an HTTP error, not an ack, so a client keeps its queue.
8. Specs, mock-only with hand-built modules (`createTestingModule` needs a live CouchDB): owner key; the database service against a fake `nano`; prefix add and strip; the type rule; a stale write; a future-dated `activityTimeUtc`; anonymous 401; dispatch (no `dataSource` still reaches the shared path, `"user"` never does); the source-off error; `clientConfig` advertisement; the rate-limit key.

### Phase 3 — app: move activity and wire sync

1. New `app/src/userActivity/source.ts` with one start-up function. Call it immediately after `init()` in `main.ts` — components call the store right after mount, before `initUserActivity` runs today — and from `ssg/clientRuntime.ts`. The web build thereby gains the migration, tombstone pruning and viewed mirror it lacks today.
2. `userActivity/store.ts`: read and write through `source.db.upsert({ doc, overwriteLocalChanges: true })`. Use `activityTimeUtc` for ordering, the `viewed` trim and tombstone age.
3. `userActivity/migrate.ts`, `fromContentProgress.ts`: write through the store, not the table.
4. One-time migration: copy rows from `luminary-db.userActivity` into the new database (add missing rows only), queueing likes and highlights before viewed, then clear the old table. Leave the table in the `luminary-db` schema for now; drop it in a later release.
5. `pages/Activity/*.vue`: group by `activityTimeUtc`.
6. The source is enabled only while signed in **and** the privacy policy status is `accepted`. Watching the `user` ref from `auth.ts` covers every way a session ends, because `clearAuthCache` nulls it. The move to the new local database is unconditional.
7. Owner handling, in one hook after `await setupAuth()` — every sign-in path ends in a boot or reload:
   - No owner marker on the device data: mark it as this user's, upload the queue, then pull.
   - Same owner: continue.
   - Different owner: `clear()`, then mark and pull.
   - Keep the marker inside the user database, so `clear()` removes it. The raw `iss|sub` from the OIDC profile is fine for it; it never leaves the device.
   - A lost session clears nothing.
8. Sign-out — `auth.ts` `logout`, called from `ProfileMenu.vue`, `DesktopSidebar.vue` and `PrivacyPolicyModal.vue`:
   - `logout()` refuses while offline; callers show the existing offline toast. The privacy-policy button must not clear the policy status before a sign-out that cannot happen.
   - Before credentials are cleared: `flush()` for a few seconds; if anything is still unsent, a confirm dialog; then `clear()`.
9. Clear activity in `pages/SettingsPage.vue`: signed in, tombstone every row, and the confirm text says it applies to all devices. Signed out, wipe the local copy.
10. Pull triggers as in section 5. Bump `userActivityVersion` after each pull so views re-read.
11. New strings (sign-out warning, clear-activity wording) go in `api/src/db/seedingDocs/lang-eng.json`; see `docs/guides/translations.md`.
12. Specs: store; migrate; progress mirror; source (adopt at sign-in, different user, held while signed out, held when not advertised, lost session keeps data); sign-out (offline refusal from all three callers, unsent warning); clear activity.
13. Docs: `app/README.md` — what syncs and what does not, sign-in and sign-out behaviour.

### Phase 4 — live updates (later)

- API: a change feed on the user-data database, fanned out to a per-owner room that authenticated sockets join at connect. Use a **new** socket event; existing events must not change (ADR 0005). The feed is also how each API instance learns of writes made through another (ADR 0015).
- shared: the data source listens for that event and writes through the same `put` as a pull.
- Nothing in Phases 1–3 needs rework for this.

### Phase 5 — per-user quota and tombstone clean-up (later)

Phases 1–3 cap the size of one doc but not how many docs a user holds, and tombstones stay on the server forever.

- **Quota**
  - A configurable cap on docs per owner, read from CouchDB's partition info (`doc_count`) and cached briefly per owner.
  - A write over the cap gets a `rejected` ack. Tombstones are always accepted, so a user can free space by removing activity.
  - `viewed` rows get the cap the app applies locally (`MAX_VIEWED`): the server drops the oldest beyond it, so a new device does not pull history the app would trim anyway.
- **Tombstone clean-up**
  - A periodic sweep in the API deletes tombstones older than a retention period, which must be at least `TOMBSTONE_TTL_MS`, so every device has had time to learn of the removal.
  - The sweep spans all owners, so it needs one non-partitioned index. Deletes are idempotent, so several API instances can run it.
  - A device that has not pulled within the retention period could still hold a row whose tombstone is gone. On its next sync it uploads its queue, clears its local copy and pulls from scratch.

### Device authorization (seam only; nothing is built)

A later feature will let users authorize devices (MFA on first sign-in, revoke a lost device). The design leaves room for it:

- The owner helper from Phase 2 is the single place a device check goes.
- Device records would live in the owner's partition and be written only by the server. Clients can write `userActivity` only, and the `_id` rule stops them forging other ids.
- A revoked device would get a machine-readable failure and run the same `clear()` used at sign-out.
- The owner key does not depend on the device, so authorizing or revoking a device never moves data.

## 9. ADR

Write one with `adr new` during Phase 1 or 2. It should record the owner-scoped data source, the `dataSource` field and its advertisement, the identity key and its secret, and the merge rule. Add a line under "Cross-package contracts" in the root `CLAUDE.md` for the `dataSource` field and the new DTO mirror.

## 10. Verification

Commands:

- `cd shared && npm run test && npm run build`
- `cd app && npm run type-check` — checks application, Vite configuration and Vitest TypeScript projects; running Vitest alone does not type-check specs.
- `cd api && npm run typecheck && npm test -- src/userData`, plus the adjusted `query.controller`, `changeRequest.service` and `changeRequest.controller` specs.
- `cd app && npx vitest run src/userActivity src/pages/Activity src/components/common src/util`. Note that `npm run test:unit` in `app/` is watch mode and never exits.
- The CouchDB-backed API specs and the Playwright E2E suite need a local CouchDB and MinIO (see `api/README.md`). The repository owner runs E2E.

Manual check, two browsers on one account against an API with the source on:

1. Like, highlight and view on A. B shows them after it reconnects or returns to the foreground, and the highlight is painted in the article on B.
2. Highlight different passages of one article on A and B without syncing in between. After sync both show both.
3. Unlike on B; A drops it. Remove one passage on A; B drops only that passage.
4. Sign out on A: the activity page is empty. Sign in again: it returns.
5. Signed out on A, like something, then sign in. The like is on the account and nothing already there is lost.
6. A different user signs in on A and sees none of the first user's activity.
7. Offline on A, every sign-out entry point (both menus, the privacy-policy button) refuses with the offline toast.
8. Clear activity on A empties B as well.
9. Against an API with the source off: activity works locally and no user-data request is sent.

## 11. Not verified — check before relying on it

- **Partition ids with several colons.** Stored ids look like `<ownerKey>:highlighted:<contentId>:<start>-<end>`. Mocked prefix tests pass, but the real CouchDB behavior remains unverified. The repository owner should check it before enabling the source.
- **Idle re-sync on a tiny dataset.** Reading the engine suggests an idle pull re-fetches the head doc and then issues a second request with `updatedTimeUtc` bounds of `0`/`0` before the column re-seals. This was traced by reading, not run. The server must accept those bounds either way.
- **REST 401 while the socket stays connected.** The queue stops at a failing head and resumes on reconnect or a queue change. Token refresh reconnects the socket, which should restart it; confirm.
- **The change-request limiter's exact burst arithmetic** was not checked against the paced first upload.

## 12. Known limits (accepted)

- The same person signing in through two different identity providers gets two separate data sets until account linking exists.
- Changing an identity provider's issuer domain, or losing `USER_DATA_ID_SECRET`, orphans the affected users' data.
- "Later wins" trusts device clocks, bounded by the server's cap on future times.
- Activity already on a device has no owner today, so it is adopted by whoever signs in there first after the update.
- Clear activity does not cover activity sitting unsent on another, offline device; it appears when that device next syncs.
- Tombstones keep post and content ids on the server until Phase 5. Erasing an account's data completely is an ops task (delete the partition) until tooling exists.
- There is no sync status in the UI; failures are silent and retried.
- The privacy policy text needs a sentence covering synced activity. That is a content change, outside this code work.

## 13. Review refactor progress

These follow-up phases are separate from the original implementation phases above.
Where the activity DTO/wire format differs, Review Phase 2 below supersedes the original
`user` / `userActivity` format described in sections 2–8.
Review Phase 4 below supersedes the earlier database asset paths in this document.

### Review Phase 1 — authentication and identity

Implemented against the authentication contract on `origin/main` at `56f1c5c5`.
That revision uses provider-issued JWTs resolved through `IdentityCacheService`;
it does not contain a separate Luminary session-token authentication flow.

- Account extraction and rate-limit identity selection live in `api/src/auth/requestIdentity.ts`.
  Controllers use this shared authentication helper for rate limiting.
- Owner authorization lives in `api/src/auth/ownerKey.ts` alongside its tests.
  Owner keys retain the exact existing HMAC input, issuer + newline + subject.
  Token refreshes and session-id changes do not move stored activity into another partition.
- Change-request, query and FTS rate limits share the existing User-id bucket when available,
  otherwise a verified issuer/subject hash. Anonymous callers use an IP bucket.
- The auth guard and identity cache retain the current `main` implementation. The branch's
  provider-unavailable response remains supported, with classification based on explicit
  failure markers/codes rather than words in a verification error message.
- Mocked regressions cover persisted owner keys, refreshed tokens, cache hits, accounts sharing
  an IP, anonymous identities, controller integration and authentication error classification.

A future session-token resolver must supply the same account identity through the auth boundary.
The activity DTO/UUID migration, service/controller split, database assets and performance work
remain in the later review phases.

### Review Phase 2 — activity DTOs and document identity

Implemented across API, shared and app:

- Extracted the existing `_id`/`type` identity fields into `_baseDocumentDto`, reused by
  the shared-data base and `BaseUserActivityDto`, without inheriting group permissions.
- Added separate viewed, liked and highlighted DTOs discriminated by `UserActivityType`.
  Current documents no longer need `activityType`. Highlight colors use `UserActivityColor`.
- Replaced prefixed ids with deterministic 36-character UUID v5 ids. Likes/views use
  `[type, parentId]`; highlights use `[type, contentId, start, end]`. Both implementations
  share fixed vectors and namespace `94bcbde6-4392-5f66-8900-7d7aabc6a7a9`.
  Parent/content references retain the existing 512-character bound because valid legacy
  content identifiers are not all UUIDs.
- Highlight passages move to a root `range`; tombstones retain identity offsets while
  discarding quoted text/color. Each activity type has a partitioned timestamp index and
  an independent source cursor.
- Current clients require the advertised `user-v2` capability. Older APIs advertising
  only `user` leave current activity local and queued. The updated API retains the `user`
  adapter for older clients, converting legacy envelopes/ids onto the same UUID records.
- An atomic local migration converts stored documents and pending uploads, preserves owner
  metadata and starts fresh `syncList:v2` cursors. The API migrates server records in pages
  of 100 before advertising either source, with an idempotent completion marker.

Upgrading an existing legacy user database requires a backup and stopping older API instances
before migration. Currently this applies only locally; new, empty deployment databases need
no legacy-data cutover. Older clients remain supported, but older API binaries cannot read
the migrated database; rollback requires its matching database backup. Live database and
two-browser integration checks remain user-owned. The later controller/service split,
database asset organization and further performance review are not part of this phase.

Verification: shared build and full unit suite, app full unit suite, mocked API DTO/query/
change-request/socket/migration tests (including JSON/multipart requests), CMS sync unit
tests, API/app/CMS type checks and lint on changed code. The API build includes all three
new partitioned indexes. Live CouchDB/S3 and browser E2E tests were not run.

### Review Phase 3 — separate query and change-request handling

- `UserQueryService` and `UserChangeRequestService` own the user read/write paths separately.
  `UserDataService` retains common owner derivation, response conversion and availability.
- `ChangeRequestController` routes parsed JSON and multipart requests to the appropriate
  service. The shared `ChangeRequestService` has no dependency on user-data processing,
  and user requests never enter shared document validation or rejection lookups.
- `UserQueryController` provides `POST /user/query`, defaulting to the `user-v2` format.
  `QueryController` retains `/query` for shared data and compatibility dispatch for existing
  source-aware clients. Client URLs, capability gating and wire formats remain supported.
- `QueryRequestService` extracts common validation, account rate limiting, identifier
  normalization, execution-cost reporting and execution-statistics removal. User queries
  always validate against the user index registry, including when shared validation is bypassed.
- User validation failures still return final rejected acknowledgements; stale writes return
  the stored document in the caller's format. Disabled/unavailable storage remains an HTTP
  error so clients retain queued activity. Shared validation messages remain unchanged.
- Services reuse Nest singleton providers and the existing user database connection.
  No database provisioning, DTO migration or client data changes are introduced in this phase.

Verification covers owner isolation on both HTTP query paths, legacy/current formats,
unknown sources, mandatory validation, shared rate-limit buckets, retryable failures,
JSON/multipart write dispatch and existing activity/identity regressions using mocked
databases: 253 tests passed across 14 suites. API build, type checking and lint on changed
code also passed. Live database and browser E2E tests remain user-owned. Database asset organization
and the further performance review remain later review work; original live-sync/quota
phases remain deferred.

### Review Phase 4 — database assets and connection lifetime

- Content indexes/views now live in `api/src/db/designDocs/content/`; partitioned user
  indexes live in `api/src/db/designDocs/user/`. Content seeds, including language documents,
  live in `api/src/db/seedingDocs/content/`. User activity has no seed documents.
- All 100 JSON assets moved without byte changes: 47 content design docs, four user design
  docs and 49 content seeds. CouchDB ids/index names and stored data formats are unchanged.
- `databaseAssets.ts` centralizes loader/registry paths. Nest build assets preserve the same
  directories in production output; content and user registries remain isolated and memoized.
  Language reconciliation, guides, agent instructions and fixture documentation use the new paths.
- Removed the seed loader's module-global first-database cache. Each invocation seeds its
  supplied database, and shared bootstrap reads only content assets. Removed the unused
  `destroyAllDocs` wrapper, which referenced a method that does not exist on `DbService`.
- User database initialization now shares one promise per singleton, even for concurrent or
  repeated calls. A failure remains disabled until restart; migration recovery tests create
  a new service instance to model that restart accurately.
- Mocked concurrent checks verify one nano client/initialization for 100 writes and 100
  partitioned reads, with one revision read and one insert per uncontended write and no
  repeated startup scan. Existing tests retain stale/identical-write suppression and conflict
  re-reads. No activity-document cache is introduced that could become stale across API instances.

Live CouchDB/S3 tests, throughput measurements and browser E2E remain user-owned. Original
Phase 4 (live owner updates) and Phase 5 (quotas/tombstone cleanup) remain deferred.

Verification: 249 mock-only tests passed across 16 suites, plus API build/type checking and
lint/format checks on changed API code. All 100 relocated JSON assets match their original
bytes and the compiled copies. Build output contains no assets at the old root paths.

### Review Phase 5 — final performance review and regression checks

Scope confirmed with the repository owner: review and regression checks; original quota and
tombstone-cleanup Phase 5 remains deferred. Findings and verification limits are recorded in
`docs/reviews/user-data-sync-final-review.md`.

- Source pulls now use indexed pending-document key lookups instead of loading every queued
  document's payload for each incoming page. Transactional protection of local edits remains.
- Format migration queues the same winning document it retains locally, preventing an older
  or equal-time queued live copy from undoing a retained tombstone. Regression cases cover
  stored/queued conflicts and duplicate queued versions.
- Additional mocked checks cover simultaneous writes to the same owner/document and exhausted
  conflict retries, alongside the existing singleton and request-count checks.
- **Open correctness finding:** a mocked source probe with three documents at one timestamp
  and batch size two imports only two. The inherited timestamp-only sync cursor can seal a
  saturated timestamp prematurely. Stable tie-breaker pagination requires a separate coordinated
  API/client cursor change; it is not fixed by this review. See the review report for reproduction.

Live CouchDB/S3 tests, browser E2E and throughput measurements remain user-owned. This review
does not claim complete sync convergence while the timestamp-tie finding is unresolved.

Normal regression suites passed: app 2,170 (one skipped), shared 1,525, CMS 1,224 and selected
mocked API/HTTP 274. API/app/CMS type checks and changed-code lint passed. The separate
timestamp-tie diagnostic failed as described above and remains an open finding.
Shared/API/app/CMS builds passed; the CMS build used the favicon setting from `.env.example`
as a command-scoped override because the local value was unset. No `.env` file was edited.


### Review item 4 — request identity boundary

Checked `origin/main` at `ffb2226f` on 2026-11-24: provider JWT authentication and the
identity cache are present; the session-token implementation has not landed.

- `AuthGuard` builds immutable `request.authIdentity` through `auth/requestContext.ts`.
  Owner and rate-limit keys are resolved in auth before controller processing.
- User-data read/write services accept the authorized owner key. `UserDataService` no
  longer derives account identity or reads the owner secret.
- Change-request, query and FTS rate limits consume the auth-resolved key. Existing
  shared User buckets, account fallback hashes and persisted HMAC owner keys are unchanged.
- Pending session-token integration: map the verified session to the original issuer and
  subject before building this context. Verify the same owner and allowance across JWTs,
  session credentials, refreshes and separate devices once that implementation lands.
  This refactor does not implement or claim session-token support.


### Review item 6 — activity wording and French review

- Restored the 30 unrelated English wording edits to their main-branch values, as requested.
- Kept plain-language English for the four account-activity messages and updated their
  French translations to match, avoiding technical terms for saving changes between devices.
- Aligned the app's English activity test fixtures with the feature's seed messages.
- Pending: Johan's French-language review of these four messages. Automated checks do not
  replace that review; no approval by Johan is implied.
