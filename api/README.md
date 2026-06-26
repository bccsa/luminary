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

### S3 storage (MinIO)

For development purposes, MinIO can be installed as a docker for S3 compatible storage:

This command will create an instance with a pre-configured access key / secret combination:

```shell
docker run -d -p 9000:9000 -p 9001:9001 --name luminary-storage -e "MINIO_ACCESS_KEY=minio" -e "MINIO_SECRET_KEY=minio123" quay.io/minio/minio server /data --console-address ":9001"
```

```shell
docker run -d \
   -p 9000:9000 \
   -p 9001:9001 \
   --name luminary-storage \
   -e "MINIO_ACCESS_KEY=minio" \
   -e "MINIO_SECRET_KEY=minio123" \
   quay.io/minio/minio server /data --console-address ":9001"
```

If you need to log into the MinIO web console, the root user and password can be passed instead. Note that you manually will have to create an access key / secret combination and update your .env file accordingly. The web console is available on http://localhost:9001

```shell
docker run -d \
   -p 9000:9000 \
   -p 9001:9001 \
   --name luminary-storage \
   -e "MINIO_ROOT_USER=rootuser" \
   -e "MINIO_ROOT_PASSWORD=password" \
   quay.io/minio/minio server /data --console-address ":9001"
```

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
user holds both `View` and `CmsView`), so the connection declares its mode in the `joinSocketGroups`
handshake (`cms: true | false`). The server routes it to one of two room sets per group:

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
