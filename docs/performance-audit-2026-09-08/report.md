# Production query and sync measurements

8 September 2026 · `https://api.app.bcc.africa` · anonymous identity · branch `1978-api-investigate-performance-issues`.

Both ordinary queries and sync batches use `POST /query`. This report focuses on those paths; it excludes FTS. No application code, production data or server configuration was changed.

## Strongest result: the tag-sync index

Changing only `use_index` from `sync-content-index` to the existing `sync-tag-content-index` substantially improves the initial tag-content page. The confirmation alternated request order over 15 timed samples per index, after one warm-up each.

| 100-document initial tag sync | Median ms | Minimum ms | Maximum ms | Scan-warning samples |
| ----------------------------- | --------: | ---------: | ---------: | -------------------: |
| `sync-content-index`          |    358.51 |     319.81 |    1505.64 |                15/15 |
| `sync-tag-content-index`      |     70.52 |      59.13 |     272.97 |                 0/15 |

**5.08× faster; 80.3% lower median latency.** Both variants returned HTTP 200 and exactly the same 100 document IDs in the same order on all 30 measured responses (verified by SHA-256 of the ordered ID list). This checks the measured page, not every pagination/language/permission edge case.

The generic [sync-content index](../../api/src/db/designDocs/sync-content-index.json) includes both post and tag content and starts with `updatedTimeUtc`; the [tag-specific index](../../api/src/db/designDocs/sync-tag-content-index.json) filters to `type=content, parentType=tag` before indexing that timestamp. This design difference is consistent with avoiding scans over unrelated post content. Production accepted the candidate index and its scan warnings disappeared; the exact plan and examined-row counts remain unavailable without CouchDB access.

The request index is selected in [shared syncBatch.ts](../../shared/src/api/sync/syncBatch.ts#L74). A targeted tag-index selection is the best-supported implementation experiment. The post-specific alternative was slower for initial post sync in this sample, so do not switch every content query indiscriminately.

## Where the index choice changed

Commit `35ee02b2c87ea411b5fe7409b56c35e0ae0a6c2a` (18 June 2026, PR #1645, “Hybrid query routing + publishDate selective sync”) changed syncBatch from subtype-specific index names such as `sync-tag-content-index` to `sync-content-index` for every Content query. This is visible in the commit diff, not inferred from the latest blame line. The July always-offline change reformatted that same selection and can obscure its origin in simple blame output.

That change is a concrete regression candidate for tag sync: replaying the same production request with the old tag-specific index yields identical ordered IDs, removes the scan warning, and reduces median latency by about 80%. This does not establish the production deployment date or explain every query slowdown. The measured request has no publishDate cutoff; validate the candidate across real cutoffs, languages, permissions and subsequent sync pages before shipping a targeted change.

## Query and sync data

Five timed sequential samples per shape after one warm-up. Wire bytes are actually received compressed body bytes, not locally recompressed estimates. `Headers` includes network, proxy and server work up to response headers; it is not a database timer. `Transfer` measures the remaining response download. Size columns are KiB (1,024 bytes). Each shape also has a separate small `/protected` control measurement in the raw data.

| Request                            | Docs | Median ms | Headers ms | Transfer ms | Wire KiB | Decoded KiB | Warning        |
| ---------------------------------- | ---: | --------: | ---------: | ----------: | -------: | ----------: | -------------- |
| `sync-authProvider`                |    0 |      18.4 |       18.1 |         0.3 |      0.1 |         0.1 | —              |
| `sync-authProvider-first`          |    2 |      19.7 |       19.6 |         0.1 |      0.8 |         1.7 | —              |
| `sync-deleteCmd-authProvider`      |    0 |      17.8 |       17.7 |         0.1 |      0.1 |         0.1 | —              |
| `sync-language`                    |    1 |      20.8 |       20.7 |         0.1 |      3.3 |        10.0 | —              |
| `sync-language-first`              |    4 |      28.1 |       27.6 |         0.1 |      9.8 |        40.4 | —              |
| `sync-deleteCmd-language`          |    0 |      18.7 |       18.4 |         0.1 |      0.1 |         0.1 | —              |
| `sync-content-post`                |    0 |      20.4 |       20.2 |         0.1 |      0.2 |         0.2 | scan           |
| `sync-content-post-first`          |  100 |     250.7 |      213.5 |        48.1 |    351.4 |      1120.1 | —              |
| `sync-deleteCmd-post`              |    0 |      19.4 |       19.3 |         0.1 |      0.1 |         0.1 | —              |
| `sync-content-tag`                 |    0 |      21.3 |       21.3 |         0.1 |      0.2 |         0.2 | scan           |
| `sync-content-tag-first`           |  100 |     369.0 |      368.8 |         0.2 |     15.3 |       122.9 | scan           |
| `sync-deleteCmd-tag`               |    0 |      16.6 |       16.5 |         0.2 |      0.1 |         0.1 | —              |
| `sync-redirect`                    |    0 |      17.6 |       17.4 |         0.2 |      0.1 |         0.1 | —              |
| `sync-redirect-first`              |    0 |      17.0 |       16.8 |         0.2 |      0.1 |         0.1 | —              |
| `sync-deleteCmd-redirect`          |    0 |      16.9 |       16.8 |         0.1 |      0.1 |         0.1 | —              |
| `sync-storage`                     |    0 |      18.8 |       18.7 |         0.1 |      0.1 |         0.1 | —              |
| `sync-storage-first`               |    1 |      35.3 |       35.2 |         0.2 |      0.4 |         0.6 | —              |
| `sync-deleteCmd-storage`           |    0 |      30.5 |       30.2 |         0.2 |      0.1 |         0.1 | —              |
| `sync-content-publishDate-window`  |    1 |      53.0 |       52.9 |         0.1 |      0.5 |         0.7 | scan           |
| `sync-content-includeExpired`      |    0 |      34.5 |       34.4 |         0.1 |      0.2 |         0.2 | scan           |
| `sync-content-alwaysOffline`       |    0 |      32.4 |       32.3 |         0.2 |      0.1 |         0.1 | —              |
| `hybrid-by-slug`                   |    1 |      37.2 |       37.1 |         0.1 |      6.0 |        14.2 | —              |
| `hybrid-by-parentId`               |    3 |      53.8 |       53.6 |         0.1 |     15.5 |        40.9 | —              |
| `hybrid-parentId-fanout-overflow`  |   50 |     426.7 |      371.6 |        55.4 |    166.4 |       500.0 | index rejected |
| `hybrid-pinned`                    |    4 |      21.6 |       21.3 |         0.1 |      0.9 |         3.4 | —              |
| `hybrid-by-tagType`                |   20 |      37.3 |       37.2 |         0.1 |      3.3 |        26.3 | —              |
| `hybrid-by-id-list`                |   25 |     462.4 |      440.5 |        21.9 |     88.3 |       256.3 | scan           |
| `hybrid-max-limit`                 |  500 |     714.6 |      414.4 |       214.4 |    616.8 |      2238.5 | —              |
| `sync-content-post-first-limit-25` |   25 |     345.4 |      324.1 |        21.8 |     96.2 |       280.0 | scan           |
| `sync-content-post-first-limit-50` |   50 |     169.8 |      119.8 |        50.0 |    186.9 |       552.8 | —              |
| `sync-content-tag-first-limit-25`  |   25 |      42.3 |       42.2 |         0.1 |      4.7 |        33.6 | —              |
| `sync-content-tag-first-limit-50`  |   50 |      64.1 |       63.9 |         0.1 |      9.3 |        74.9 | —              |

Initial sync here is one page, not completion of the whole local sync database. Incremental windows are the catalogue’s last 7 days (30 days for the publish-date-window case), not a measured live client cursor. The 500-limit and always-offline entries are synthetic catalogue probes, not claims about observed user traffic. Permission-blocked CMS queries are excluded.

## What the data says

- **Tag initial sync:** 369 ms for a 100-document page whose compressed body is only about 15 KiB. Almost all time is before response headers. The alternating index experiment above is stronger evidence than comparisons between local and production environments.
- **ID-list lookup:** 25 documents, 462 ms median, about 440 ms before response headers, and a scan warning. Investigate permission-preserving keyed lookups rather than treating this as network download cost.
- **Multi-parent overflow lookup:** 50 documents, 427 ms median. Production explicitly warns that `_design/content-parentId-publishDate-index` was not used because it lacks a valid index for this query. This confirms a production index-selection problem, not merely a local baseline finding.
- **Initial post sync:** 100 documents, 251 ms median, 1.09 MiB decoded / 351 KiB transferred. Its response includes about 476.5 KB of serialized FTS values and 529.0 KB of article text. Payload cost is material here; compression is already working.
- **Incremental content sync:** post and tag cases return zero documents in this fixed window, but still report scan warnings. Their 20–21 ms medians are currently low; warnings identify inefficient work without proving it is the dominant user delay.
- **Basic reads:** slug lookup returns one document in 37 ms, one-parent lookup returns three in 54 ms, and pinned content returns four in 22 ms. These controls show that /query as a whole is not uniformly slow.
- **Page-size experiment:** tag limit 25 / 50 / 100 gives medians 42 / 64 / 369 ms. Smaller pages may reduce time to the first batch, but multiply calls and do not by themselves establish lower full-sync time. Post page-size timing is non-monotonic (25: 345 ms, 50: 170 ms, 100: 251 ms), so there is no reliable universal page-size recommendation from this sequential sample.

## Same-query index alternatives

Five samples per variant, alternating order. Only `use_index` changes. All variants returned the same ordered ID list as their baseline for the measured request.

| Request                           | Current index median ms | Subtype index median ms | Current warnings | Subtype warnings |
| --------------------------------- | ----------------------: | ----------------------: | ---------------: | ---------------: |
| `sync-content-post-first`         |                  284.47 |                  334.71 |              0/5 |              0/5 |
| `sync-content-tag-first`          |                  447.18 |                   68.76 |              5/5 |              0/5 |
| `sync-content-post`               |                   19.72 |                   18.32 |              5/5 |              0/5 |
| `sync-content-tag`                |                   19.46 |                   22.19 |              5/5 |              0/5 |
| `sync-content-publishDate-window` |                   22.87 |                   22.32 |              5/5 |              5/5 |

Post queries used `sync-post-content-index`; tag queries used `sync-tag-content-index`. Disappearing warnings on fast empty incremental queries do not imply a meaningful latency improvement: differences there are small relative to network variation. Publish-date filtering still produces scan warnings with the post-specific index.

## Load data from the earlier bounded run

| Query                     | Concurrent requests | Throughput req/s | Median ms |  p95 ms | Errors |
| ------------------------- | ------------------: | ---------------: | --------: | ------: | -----: |
| `sync-content-post-first` |                   1 |             3.48 |    281.61 |  321.94 |      0 |
| `sync-content-post-first` |                   5 |              3.9 |   1158.16 | 1653.01 |      0 |
| `sync-content-post`       |                   1 |            23.38 |     39.54 |   66.46 |      0 |
| `sync-content-post`       |                   5 |            66.29 |     22.89 |   31.58 |      0 |
| `hybrid-by-slug`          |                   1 |            41.82 |     22.56 |    27.8 |      0 |
| `hybrid-by-slug`          |                   5 |           101.48 |     42.72 |   58.93 |      0 |

20 requests per row, not a sustained capacity measurement. These earlier requests used the original catalogue group filters. The later focused study corrected the filters; do not treat the earlier load numbers as a measured capacity for all sync users or for the candidate tag index.

## Audit corrections and limitations

The original catalogue takes sampled content groups and reuses them for all sync document types. The actual app uses accessible groups separately per type ([app sync.ts](../../app/src/sync.ts#L71)). This focused runner obtains production’s anonymous access map over Socket.io and supplies the correct `view` groups for each type; it also sets `includeExpired=true` for incremental content requests, matching syncBatch. Exact adjustments and every request body are saved in `measurements.json`.

This matters: original first-language sync returned zero documents; the corrected query returns four. Original first-auth-provider sync returned zero; corrected returns two. Empty original responses must not be used as evidence that those data paths are cheap. The general-purpose catalogue has not yet been updated for this per-type-group issue; use the saved focused runner to reproduce these corrected results.

Production lacks `X-Perf-Trace` and we have not inspected its database directly. Request warnings are direct evidence, but exact selected indexes, rows examined, database CPU, and server handler timings are unavailable. Network/proxy/background-load variation remains visible. For tag sync, the alternating same-query comparison controls input and ordering far better than the prior local-versus-production audit. No local runtime or production deployment SHA comparison was made.

## Reproduce and inspect

- [All focused measurements and request bodies](measurements.json).
- [Five-query index comparison](index-comparison.json).
- [15-sample tag confirmation](tag-index-confirmation.json).
- Saved runners: [query/sync](query-sync-audit.cjs), [index comparison](query-index-ab.cjs), [tag confirmation](tag-index-confirm.cjs).

Run from `api/`:

```sh
node perf-reports/query-sync/query-sync-audit.cjs
node perf-reports/query-sync/query-index-ab.cjs
node perf-reports/query-sync/tag-index-confirm.cjs
```

The runners replay the saved production audit context and fixed timestamps; for a future-date audit, refresh the source full audit and point the runner to its new report. Keep the paired comparison inputs fixed within each run. This review copy is saved in `docs/performance-audit-2026-09-08/`. The original reports and executable runners remain in `api/perf-reports/query-sync/`; the reproduction commands below use that original location.
