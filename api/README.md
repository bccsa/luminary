# Luminary API

API for Luminary, built with [Nest](https://github.com/nestjs/nest) and [CouchDB](https://couchdb.apache.org/).

## Prerequisites

The following software is needed to run and/or test the Luminary API:

-   CouchDB (document database) - see https://couchdb.apache.org
-   S3 (compatible) storage, e.g. MinIO - see https://min.io

### CouchDB installation

For development purposes, CouchDB can be installed as a docker:

```shell
docker run -p 5984:5984 -d -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=yourpassword couchdb
```

After successfully running CouchDB, create a local database via the CouchDB web interface at http://localhost:5984/\_utils/ using the credentials you set above.

### Optional account activity sync

The `user` data source stores likes, viewed activity and highlighted passages in a separate,
owner-partitioned CouchDB 3.x database. It does not use the shared dataset's group permissions.
Without configuration, the source stays off and clients keep activity local and queued.

Provision the database before enabling the source. For local development, run from the repository root:

```sh
./scripts/setup-dev.sh setup-user-data luminary-user-data
```

It creates or verifies the partitioned database and preserves existing data. The full setup
wizard also provisions it when `DB_USERDATA_DATABASE` is configured in `api/.env`.
The command uses `DB_CONNECTION_STRING` from the shell environment first, then `api/.env`,
including its host, port and credentials. If neither is configured, it falls back to the
local Docker/default credentials. The configured account needs permission to create databases;
HTTP 401/403 means its credentials or admin permissions need checking. Passwords are not logged.
For staging/production, ops performs the equivalent request:

```sh
curl --fail -u "$COUCHDB_USER:$COUCHDB_PASSWORD" -X PUT \
  'http://127.0.0.1:5984/luminary-user-data?partitioned=true'
```

Set both API environment variables, then restart the API:

```dotenv
DB_USERDATA_DATABASE=luminary-user-data
USER_DATA_ID_SECRET=<a dedicated secret generated once with openssl rand -hex 32>
```

Back up `USER_DATA_ID_SECRET` securely and **never rotate it**. It is independent of
`ENCRYPTION_KEY`; losing or changing it or an issuer's domain orphans the corresponding data.
The database must differ from `DB_DATABASE`. Startup checks that it exists and is partitioned,
then installs the design documents from `src/db/userDataDesignDocs/`. Only a successful check
advertises `clientConfig.dataSources: ["user"]`. A missing database, incomplete settings or
index-installation failure logs an error and leaves the source off without a retry loop.
Correct the configuration and restart to retry initialization; the API never creates this database.

Authenticated clients reuse `POST /query` and `POST /changerequest` with `dataSource: "user"`.
Omitting `dataSource` preserves the shared-dataset path; unknown sources return 400.
Identity comes exclusively from the verified JWT's issuer and subject, even without a shared
User document. The API derives the owner with HMAC-SHA256, adds `<ownerKey>:` to stored ids,
queries through CouchDB's partition path, and strips that prefix from response documents.
Bookmarks are omitted because they can encode internal stored ids.

User queries require `selector.type: "userActivity"`, use a separate index allowlist, and accept
the sync engine's `updatedTimeUtc` bounds including zero and `Number.MAX_SAFE_INTEGER`.
Change requests validate a standalone `UserActivityDto`: id up to 1,024 characters, parent/content
ids up to 512, and highlighted text up to 10,000. Ids need their activity-type prefix and may
contain colons or non-UUID content ids. A live highlight needs a content id and one valid passage;
its tombstone may omit the passage. Client `_rev`, `updatedTimeUtc` and unknown fields are stripped.
Future activity times are capped at the server clock. A later stored activity wins, including
tombstones, and conflict retries re-check that comparison against the latest revision.

User-data validation failures return HTTP 200 with a rejected ack; a stale upload includes the
stored client-shaped document in `docs`. Accepted uploads also return HTTP 200. Disabled sources
and storage failures return an HTTP error so the client retains its queue for retry. The default
change-request response status is unchanged. The change-request limiter uses the shared User id,
otherwise a hash of verified issuer/subject, otherwise the caller IP.

This phase supports pull-based convergence. Owner live updates, per-account quotas and server
tombstone cleanup remain separate follow-up work (ADR 0020). CouchDB/S3 integration tests and
the two-browser account-sync checks are run by the repository owner.

### S3 storage (MinIO)

For development purposes, MinIO can be run in Docker for S3 compatible storage. MinIO no longer publishes official images (`quay.io/minio/minio` and Docker Hub `minio/minio` are gone), so we use Chainguard's build of MinIO from source. `scripts/setup-dev.sh` and `api/scripts/start-minio-in-ci.sh` pin it by digest.

This command creates an instance whose root user / password double as the access key / secret in your `.env` file:

```shell
docker run -d \
   -p 9000:9000 \
   -p 9001:9001 \
   --name luminary-storage \
   -e "MINIO_ROOT_USER=minio" \
   -e "MINIO_ROOT_PASSWORD=minio123" \
   cgr.dev/chainguard/minio server /data --console-address ":9001"
```

The web console is available on http://localhost:9001 using the same credentials.

## Installation

1. Copy the environment variable file and fill in required fields, such as the database connection string:

```sh
cp .env.example .env
```

2. Install dependencies:

```sh
$ npm ci
```

## Running the API

3. Seeding the database:

Before running Luminary against a clean CouchDB database it is recommended to seed the database with the default document set. This document set is also used for unit tests, and should help you to get a functional setup to start with.

```sh
$ npm run seed
```

By default the API will run at http://localhost:3000.

4. Run the server:

```sh
# development
$ npm run start

# watch mode
$ npm run start:dev # or just 'dev'

# production mode
$ npm run build
$ npm run start:prod
```

## Test

Copy and `.env.test.example` file to `.env.test` and set the required values, such as the database connection string.

```sh
cp .env.test.example .env.test
```

Run the unit tests:

```sh
# unit tests
$ npm run test:unit

# test coverage
$ npm run test:cov
```

Jest (included with NestJS) is used for automated API unit testing. Each test file gets a fresh, seeded CouchDB database via `createTestingModule` (see `src/test/testingModule.ts`), seeded from [`src/db/designDocs`](src/db/designDocs) and [`src/db/seedingDocs`](src/db/seedingDocs).

The Jest unit testing currently does not include teardown logic. Destroying documents does not delete them from the CouchDB database, it marks them as deleted — this does not work well with testing where we reuse the testing database (i.e. local testing on your computer), since CouchDB / nano complains that the document is deleted and hence cannot be recreated. In real-life scenarios recreating a deleted document should never occur, and if it does this would be an exception that should be logged to an error log instead of being processed. It therefore does not work to destroy our testing data set for local testing — the developer can rather delete the testing database on their computer once in a while if it gets too big.

## Lint

```sh
# lint code and output errors
$ npm run lint

# lint code and fix auto-fixable errors
$ npm run lint:fix
```

## Logging

In production mode (`npm run start:prod`) the API logs are stored in a tailable api.log file. The log files are rotated when the size exceeds 1MB and only the latest 5 files are being kept. In development mode logs are printed to the console.

## Load testing

The load tester currently tests the API for Luminary Client app sync loads on the /query API endpoint.

```sh
# load tester help
$ npx ts-node load_tester --help
```

## Documentation

- [docs/rest-api/README.md](docs/rest-api/README.md) — REST bulk sync API and SyncMap
- [docs/socket-io-messages.md](docs/socket-io-messages.md) — Socket.io message reference (API ↔ clients)
- [docs/s3-multi-bucket/README.md](docs/s3-multi-bucket/README.md) — S3 multi-bucket storage architecture

## HLS decryption keys and the `/sidecar` rate limiters

Encryption keys for HLS media are stored as `Sidecar` documents, which are never
replicated to clients; `GET /sidecar` is their only read path (ADR 0019).

That endpoint is guarded by two rate limiters that, unlike the expensive-query
limiter, **default ON**: `SIDECAR_RATE_LIMIT_READ_*` bounds successful key fetches
and `SIDECAR_RATE_LIMIT_PROBE_*` bounds repeated 403/404s at a lower ceiling. See
`.env.example` for the full set and their defaults.

Worth knowing when diagnosing playback: a blocked caller gets HTTP 429, and the
shared http layer swallows it, so the app and CMS players report the media as
needing a key rather than as rate limited. Check these limits before chasing a
decryption fault.

## CMS view permission (`CmsView`) and CMS-scoped live updates

The CMS sees more than the app — drafts, scheduled, and expired Content — and that extra
visibility is gated by a dedicated ACL permission, **`CmsView`** (GitHub #160, see ADR 0013).
Plain `View` is the app/public gate (published content only); `CmsView` is the CMS gate.

### The `cms` request flag

Every read carries a `cms` flag: the CMS sends `cms: true`, the app `cms: false`. The flag
**requests** CMS-scoped results; the actual gate is the permission:

- **`POST /query`** and **`POST /fts`** select the permission per request: `cms ? CmsView : View`.
  A `cms: true` request returns drafts/expired only for groups where the caller holds `CmsView`.
  If the caller holds no `CmsView` on any requested group, the request is **403 Forbidden** (the
  same fail-closed behaviour as a missing `View`) — it does **not** silently fall back to
  published-only. `QueryService` remains the data-leakage boundary; for non-`cms` requests it
  still injects the published/scheduled/expiry filters before the query runs.

### Socket.io rooms: base vs `-cms`

Live updates can't read the `cms` flag off each message, and the AccessMap is per-**user** (a CMS
user holds both `View` and `CmsView`), so the connection declares its mode in the `clientConfigReq`
handshake (`cms: true | false`; the API also accepts the deprecated `joinSocketGroups` alias for
older clients, see ADR 0005). The server routes it to one of two room sets per group:

- **base `${docType}-${group}`** — app connections join these via `View`.
- **`${docType}-${group}-cms`** — CMS connections join these via `CmsView`.

A CMS connection joins **only** `-cms` rooms (never base), so base-room guarding can never corrupt
its full copy. `deleteCmd-${group}` rooms are shared (un-suffixed) by both modes. On a document
update:

- **`-cms` rooms** receive the **full** doc for **every** status (published, draft, expired) — this
  is what gives CMS users live draft/expired collaboration.
- **base rooms** receive only what the app may hold: published-and-live Content and all non-Content
  docs in full; **expired** Content as a stripped cleanup stub (see below); **draft** Content is
  withheld entirely.

### Data minimization & the expiry edge case

A non-CMS client only ever receives an expired Content doc so it can *prune* its stale local copy
(it never displays it), so the body must not cross the wire. `api/src/util/stripExpiredContent.ts`
projects an expired doc down to a minimal cleanup stub (identity, grouping, status/expiry, sync
cursor — no title/body/SEO/media/FTS). The same projection is applied in two places: the `/query`
response for non-`cms` callers, and the Socket.io base-room emit.

The stub still carries `expiryDate`/`status`, so the app's `deleteExpired()` prunes the doc rather
than orphaning the stale, still-visible version on the device (the edge case from #433). **Do not**
"optimize" the base-room rule to drop expired Content entirely — that reintroduces the orphan bug.
Unpublish (published → draft) is handled separately: the now-draft doc is withheld from base rooms
and the app is evicted by the existing app-only `DeleteReason.StatusChange` DeleteCmd.

CMS users are auto-granted `CmsView` on deploy by schema upgrade `v19` (every ACL entry that already
has Edit/Translate/Publish), so existing editors keep working through the rollout.
