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
| `--api-only` | off | Skip all direct CouchDB access; defaults to latency, fts and socket suites |
| `--db=` | `$DB_DATABASE` | CouchDB database to inspect for plans and index state |
| `--couch=` | `$DB_CONNECTION_STRING` | CouchDB root URL |
| `--suites=` | all | `indexes,explain,latency,fts,concurrency,socket` |
| `--samples=` | `15` | Timed repetitions per request (latency and fts suites) |
| `--warmup=` | `3` | Discarded repetitions before timing (latency and fts suites) |
| `--fts-term=`, `--fts-rare-term=` | discovered | Pin the `/fts` search terms instead of picking them from sampled titles — required to compare runs across corpora |
| `--concurrency=` | `1,5,25,50` | Load levels |
| `--requests=` | `100` | Requests per load level |
| `--token=`, `--provider=` | — | Run as an authenticated identity instead of anonymous |
| `--out=` | `api/perf-reports` | Report directory |

Running without `--token` exercises the anonymous identity, which only works if the database has
a provider-less `AutoGroupMappings` document granting some groups. With a token you also get the
authenticated auth path, which does substantially more work per request — worth measuring both.

## What each suite answers

For a remote production API, start with a sequential anonymous run:

```sh
npm run perf:audit -- --url=https://api.app.bcc.africa --api-only --suites=latency,fts,socket --samples=5 --warmup=1
```

This avoids mixing the local `.env` database into remote results. Database counts and plans
remain unavailable, and phase timings require tracing on the target API. Compare successful
requests with equivalent identities, data and payload sizes; localhost timings exclude the
production network path. Add the concurrency suite explicitly when measuring offered load.

- **indexes** — which declared indexes are deployed, what they cost on disk, how far their views
  lag the database, and which ones nothing references any more. Every index is updated on every
  matching write, so an unreferenced one is a permanent write cost.
- **explain** — which index CouchDB picks for each client-shaped query, and whether a pinned
  `use_index` is actually honoured. A silent fall back to `_all_docs` is a full scan.
- **latency** — the core suite. Every request shape in `catalogue.ts`, timed end-to-end and to
  first byte (`ttfb` — the API buffers the whole body before sending, so `ttfb` ≈ handler time
  and `client - ttfb` is body download), with the API's own per-phase breakdown (auth /
  validation / permission filtering / CouchDB / post-processing), CouchDB round-trip counts,
  `total_docs_examined`, and response size.
- **fts** — `/fts` broken into its stages: trigrams generated, trigrams kept after pruning,
  candidate rows scanned, survivors after filtering, top-K fetched. Search cost is driven by the
  query text, so this is where a slow search is explained. Timings are sampled like the latency
  suite's (`--samples`/`--warmup`, reported as p50 and p95); the stage counts come from the last
  sample, since they depend on the query and the corpus rather than on the run.
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

To see which requests degrade linearly and which fall off a cliff, seed throwaway databases at
several sizes and re-run the audit against each. One database per size, so any point can be
re-run without rebuilding the others:

```sh
npm run perf:seed -- --db=luminary-perf-3k  --posts=1000  --languages=3 --tags=50 --groups=5 --recreate
npm run perf:seed -- --db=luminary-perf-15k --posts=5000  --languages=3 --tags=50 --groups=5 --recreate
npm run perf:seed -- --db=luminary-perf-60k --posts=20000 --languages=3 --tags=50 --groups=5 --recreate

DB_DATABASE=luminary-perf-3k PERF_TRACE=true npm run start
npm run perf:audit -- --db=luminary-perf-3k --suites=fts --fts-term=content --fts-rare-term=rhythm
```

The seeder refuses any database name that doesn't contain `perf`, `test` or `bench`, and refuses
to overwrite an existing one without `--recreate`. It generates real trigram FTS data using the
API's own `computeFtsData`, so `/fts` behaves as it would in production. Stop the API (or point it
at another database) while seeding — its changes feed would otherwise process every seeded
document for nothing.

### Seeder flags

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--db=` | `luminary-perf` | Target database; the name must contain `perf`, `test` or `bench` |
| `--couch=` | `$DB_CONNECTION_STRING` | CouchDB root URL |
| `--posts=` | `2000` | Posts to generate; each yields one content document per language |
| `--languages=` | `3` | Languages — and therefore content documents per post |
| `--tags=` | `50` | Tags |
| `--groups=` | `5` | Groups; content is spread across them round-robin |
| `--recreate` | off | Drop and rebuild the database if it already exists |

### Getting a comparable series

- **Count content documents, not posts.** `/fts` indexes content only — one view row per trigram
  per content document — and `--posts=N --languages=L` produces `N × L` of them.
- **Hold `--languages`, `--tags` and `--groups` constant.** `groups` in particular decides how
  content is spread across permissions, which changes how many candidates survive filtering.
- **Pin the search terms.** Left to discovery, the audit samples 200 titles and takes the most
  and least frequent words — a different pair at every corpus size, so the series would measure
  term variance rather than scaling. Pick terms from the seeder's own word list. The seeder draws
  words uniformly, so "frequent" and "rare" only differ by how common their _trigrams_ are:
  `content` (widely shared trigrams) against `rhythm` (unusual ones). The run log states the
  terms in use and whether they were pinned.
- **Wait for the view build before auditing.** The seeder pre-warms `fts-trigram-index` and
  `fts-corpus-stats`, but Node's `fetch` gives up after five minutes and the seeder swallows the
  error — on a large corpus it prints `Seeded` while CouchDB is still indexing. Confirm
  `GET /<db>/_design/fts-trigram-index/_info` reports `updater_running: false` first.
- **Compact the view after each seed.** CouchDB's B-tree is append-only, so a freshly built view
  carries 25–30% dead space, and the share differs from one build to the next — left alone it
  would leak into the series as a second variable. `POST /<db>/_compact/fts-trigram-index`, wait
  for `compact_running: false` in `_info`, and `sizes.file` drops to about `sizes.active`. It
  also keeps the auto-compactor from starting on its own in the middle of a run on a large
  corpus. Record in the run context that views were compacted; production's are probably not.
- **Check disk between sizes.** Every trigram view row carries the document's filter metadata,
  so the view grows far faster than the database. Run `--suites=indexes` after each seed and
  read `sizes.file` before seeding the next. Fauxton's "Data size on disk" is `sizes.external`
  (the uncompressed size), not the file size.

### What to look for

Two constants shape the curve on purpose. `FTS_MAX_TRIGRAM_DOC_PERCENT` prunes trigrams by their
share of the corpus, so which ones survive shifts with size. `FTS_CANDIDATE_ROW_BUDGET` caps the
candidate scan: once it binds (`budgetBound` in the report), latency stops growing while ranking
works from a truncated set — a flat curve there is a quality loss, not a win. The size at which
the budget starts binding is the finding.

The seeded documents are all the same length, so the series measures cost against size. It says
nothing about ranking quality, which depends on length variance the synthetic corpus does not have.

## The tracing flag

`PERF_TRACE=true` turns on `src/util/perfTrace.ts`: an `AsyncLocalStorage` trace started in a
Fastify `onRequest` hook (before guards, so auth is included), phase spans at the endpoints, and
a proxy around the nano scope that counts every CouchDB round trip. The result is returned in an
`X-Perf-Trace` response header, leaving response bodies untouched. With the flag off, every hook
short-circuits on a memoized boolean.
