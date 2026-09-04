# API performance audit

Measures how long every request shape the API serves takes, where that time goes, and why.

## Running it

The audit needs the API running with tracing on — without it you get end-to-end timings but no
phase breakdown, which is the part that makes the numbers actionable.

```sh
# terminal 1
PERF_TRACE=true npm run start:dev

# terminal 2
npm run perf:audit
```

Reports land in `api/perf-reports/` as a Markdown summary plus the raw JSON behind it.

### Options

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--url=` | `http://localhost:$PORT` | API base URL |
| `--db=` | `$DB_DATABASE` | CouchDB database to inspect for plans and index state |
| `--couch=` | `$DB_CONNECTION_STRING` | CouchDB root URL |
| `--suites=` | all | `indexes,explain,latency,fts,concurrency,socket` |
| `--samples=` | `15` | Timed repetitions per request |
| `--warmup=` | `3` | Discarded repetitions before timing |
| `--concurrency=` | `1,5,25,50` | Load levels |
| `--requests=` | `100` | Requests per load level |
| `--token=`, `--provider=` | — | Run as an authenticated identity instead of anonymous |
| `--out=` | `api/perf-reports` | Report directory |

Running without `--token` exercises the anonymous identity, which only works if the database has
a provider-less `AutoGroupMappings` document granting some groups. With a token you also get the
authenticated auth path, which does substantially more work per request — worth measuring both.

## What each suite answers

- **indexes** — which declared indexes are deployed, what they cost on disk, how far their views
  lag the database, and which ones nothing references any more. Every index is updated on every
  matching write, so an unreferenced one is a permanent write cost.
- **explain** — which index CouchDB picks for each client-shaped query, and whether a pinned
  `use_index` is actually honoured. A silent fall back to `_all_docs` is a full scan.
- **latency** — the core suite. Every request shape in `catalogue.ts`, timed, with the API's own
  per-phase breakdown (auth / validation / permission filtering / CouchDB / post-processing),
  CouchDB round-trip counts, `total_docs_examined`, and response size.
- **fts** — `/fts` broken into its stages: trigrams generated, trigrams kept after pruning,
  candidate rows scanned, survivors after filtering, top-K fetched. Search cost is driven by the
  query text, so this is where a slow search is explained.
- **concurrency** — latency against offered load. `queue ms` (client time minus server handler
  time) growing faster than server time points at the Node event loop rather than CouchDB.
- **socket** — connect and handshake timing, and the size of the access map sent to every client
  on every connect.

## Running authenticated

The anonymous path is cached and costs almost nothing, so the numbers that matter only appear
under a real token. `local-issuer.mjs` serves a JWKS for the e2e signing key on the port the
existing `auth-provider-e2e` provider document already points at, and mints a persona token —
no database writes are needed to set it up.

```sh
# terminal 1 — issuer (leave running)
node scripts/perf/local-issuer.mjs editor1

# terminal 2 — API. The provider domain is http://, which the API refuses unless allowed.
# Pass the flag on the command line; it is a security switch, not a setting.
PERF_TRACE=true AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true npm run start

# terminal 3
npm run perf:audit -- --token="$(cat .perf-token)" --provider=auth-provider-e2e
```

Personas: `editor1` (default), `editor2`, `superadmin`, `private`. A persona with CmsView
unblocks the CMS sync and search shapes that the anonymous identity cannot reach — coverage
goes from roughly 44 of 72 request shapes to 69.

Two things to know before running it. Every authenticated request currently rewrites the
persona's User document (`lastLogin`), so a full run adds a few thousand revisions to it.
And under load the concurrency suite drives all requests through a single identity, so they
contend on that one document — the resulting throughput is a per-identity ceiling, not a
global one.

## Corpus scaling

To see which requests degrade linearly and which fall off a cliff, seed a throwaway database and
re-run the audit against it at several sizes:

```sh
npm run perf:seed -- --db=luminary-perf --posts=2000 --recreate
DB_DATABASE=luminary-perf PERF_TRACE=true npm run start:dev
npm run perf:audit -- --db=luminary-perf
```

The seeder refuses any database name that doesn't contain `perf`, `test` or `bench`, and refuses
to overwrite an existing one without `--recreate`. It generates real trigram FTS data using the
API's own `computeFtsData`, so `/fts` behaves as it would in production.

## The tracing flag

`PERF_TRACE=true` turns on `src/util/perfTrace.ts`: an `AsyncLocalStorage` trace started in a
Fastify `onRequest` hook (before guards, so auth is included), phase spans at the endpoints, and
a proxy around the nano scope that counts every CouchDB round trip. The result is returned in an
`X-Perf-Trace` response header, leaving response bodies untouched. With the flag off, every hook
short-circuits on a memoized boolean.
