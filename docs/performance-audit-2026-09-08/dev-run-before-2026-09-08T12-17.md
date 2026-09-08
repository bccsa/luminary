# API performance audit
Run 2026-09-08T12:17:33.755Z against https://api.dev.app.bcc.africa (API-only; database not inspected).

Identity: **anonymous**. Samples per request: 8 (after 2 warm-up). Suites: latency, socket.

> API-only measurement: internal phases require X-Perf-Trace. Where tracing is absent, zero phase/DB/pipeline values mean unavailable, not zero work. Client timings include network, proxy and body transfer; they cannot by themselves identify a server bottleneck.

> **Coverage note.** This run used the anonymous identity, whose groups come from a cached lookup — so the auth phase here is close to free. The authenticated path does considerably more per request (provider lookup, JWKS verification, up to three user lookups and a `lastLogin` write). Re-run with `--token`/`--provider` to measure it.

## Corpus
| Doc type | Count |
| :--- | ---: |
| content | n/a |
| post | n/a |
| tag | n/a |
| language | n/a |
| group | n/a |
| user | n/a |
| redirect | n/a |
| deleteCmd | n/a |

Database counts, size and query plans: unavailable (API-only mode).

## Findings
### 🟡 Low — 6 request shape(s) not measured — the audit identity lacks access
*coverage* — `sync-defaultAffinity`, `sync-defaultAffinity-first`, `sync-deleteCmd-defaultAffinity`, `sync-group-cms`, `sync-group-cms-first`, `sync-deleteCmd-group-cms`. Most of these need CmsView. Re-run with --token/--provider as a CMS user to cover them.


## Request latency
`client` is end-to-end including transfer. `ttfb` is time to first byte (request → response headers); the API buffers the whole body before sending, so `ttfb` ≈ handler time and `client - ttfb` is body download. `server` is the API's own handler time. `auth`/`validate`/`couch` are traced phases; `db` counts CouchDB round trips per request. `examined` is CouchDB's `total_docs_examined`. `wire` is the Brotli-compressed body estimated locally (not measured wire traffic); `decoded` is what it parses.

### sync (app)
| Request | p50 | p95 | ttfb p50 | server p50 | auth | couch | db calls | db ms | docs | examined | wire | decoded |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sync-authProvider` | 18.42 | 19.85 | 17.92 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-authProvider-first` | 17.52 | 19.93 | 17.15 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-deleteCmd-authProvider` | 16.45 | 18.44 | 16.11 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-language` | 18.18 | 20.16 | 17.72 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-language-first` | 17.25 | 18.29 | 16.83 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-deleteCmd-language` | 15.8 | 16.86 | 15.37 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-content-post` | 52.63 | 64.76 | 51.97 | — | 0 | 0 | — | — | — | — | 3.9 KB | 10.7 KB |
| `sync-content-post-first` | 732.69 | 810.89 | 616.74 | — | 0 | 0 | — | — | — | — | 290.5 KB | 1.11 MB |
| `sync-deleteCmd-post` | 15.93 | 17.73 | 15.86 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-content-tag` | 19.46 | 22.73 | 18.83 | — | 0 | 0 | — | — | — | — | 800 B | 3.2 KB |
| `sync-content-tag-first` | 75.31 | 95.57 | 74.15 | — | 0 | 0 | — | — | — | — | 13 KB | 125.3 KB |
| `sync-deleteCmd-tag` | 17.39 | 18.96 | 17.08 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-redirect` | 16.04 | 22.94 | 15.88 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-redirect-first` | 17.86 | 19.17 | 17.59 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-deleteCmd-redirect` | 17.1 | 27.81 | 16.67 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-storage` | 17.02 | 18.23 | 16.67 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-storage-first` | 16.38 | 19.77 | 16.31 | — | 0 | 0 | — | — | — | — | 401 B | 609 B |
| `sync-deleteCmd-storage` | 17.19 | 19.52 | 16.85 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-defaultAffinity` 🔒 | 11.88 | 13.64 | 11.57 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `sync-defaultAffinity-first` 🔒 | 12.22 | 18.24 | 11.88 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `sync-deleteCmd-defaultAffinity` 🔒 | 12.24 | 15.02 | 11.95 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `sync-content-publishDate-window` | 57.19 | 198.16 | 56.38 | — | 0 | 0 | — | — | — | — | 868 B | 1.7 KB |
| `sync-content-includeExpired` | 90.06 | 219.2 | 89.67 | — | 0 | 0 | — | — | — | — | 4.6 KB | 13.7 KB |
| `sync-content-alwaysOffline` | 16.22 | 17.87 | 15.91 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |

- `sync-authProvider` — incremental sync — authProvider, limit 100 _(app/src/sync.ts)_
- `sync-authProvider-first` — first sync (full window) — authProvider, limit 100 _(app/src/sync.ts)_
- `sync-deleteCmd-authProvider` — incremental sync — deleteCmd (authProvider) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-language` — incremental sync — language, limit 100 _(app/src/sync.ts)_
- `sync-language-first` — first sync (full window) — language, limit 100 _(app/src/sync.ts)_
- `sync-deleteCmd-language` — incremental sync — deleteCmd (language) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-content-post` — incremental sync — content-post, limit 100 _(app/src/sync.ts)_
- `sync-content-post-first` — first sync (full window) — content-post, limit 100 _(app/src/sync.ts)_
- `sync-deleteCmd-post` — incremental sync — deleteCmd (post) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-content-tag` — incremental sync — content-tag, limit 100 _(app/src/sync.ts)_
- `sync-content-tag-first` — first sync (full window) — content-tag, limit 100 _(app/src/sync.ts)_
- `sync-deleteCmd-tag` — incremental sync — deleteCmd (tag) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-redirect` — incremental sync — redirect, limit 100 _(app/src/sync.ts)_
- `sync-redirect-first` — first sync (full window) — redirect, limit 100 _(app/src/sync.ts)_
- `sync-deleteCmd-redirect` — incremental sync — deleteCmd (redirect) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-storage` — incremental sync — storage, limit 100 _(app/src/sync.ts)_
- `sync-storage-first` — first sync (full window) — storage, limit 100 _(app/src/sync.ts)_
- `sync-deleteCmd-storage` — incremental sync — deleteCmd (storage) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-defaultAffinity` — incremental sync — defaultAffinity, limit 1 _(app/src/sync.ts)_ — 🔒 not permitted for this identity
- `sync-defaultAffinity-first` — first sync (full window) — defaultAffinity, limit 1 _(app/src/sync.ts)_ — 🔒 not permitted for this identity
- `sync-deleteCmd-defaultAffinity` — incremental sync — deleteCmd (defaultAffinity) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_ — 🔒 not permitted for this identity
- `sync-content-publishDate-window` — incremental sync — content narrowed by the publishDate cutoff _(shared/src/api/sync/utils.ts + shared/src/config.ts)_
- `sync-content-includeExpired` — update sync — content with includeExpired _(shared/src/api/sync/syncBatch.ts)_
- `sync-content-alwaysOffline` — content alwaysOffline sync — synthetic, no client sets this flag _(synthetic — no call site)_

### sync (cms)
| Request | p50 | p95 | ttfb p50 | server p50 | auth | couch | db calls | db ms | docs | examined | wire | decoded |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sync-authProvider-cms` | 16.5 | 21.5 | 16.14 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-authProvider-cms-first` | 18.59 | 21.8 | 18.19 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-deleteCmd-authProvider-cms` | 16.66 | 18.3 | 16.37 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-language-cms` | 16.15 | 30.74 | 15.88 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-language-cms-first` | 18.24 | 234.26 | 17.91 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-deleteCmd-language-cms` | 17.36 | 20.41 | 17.06 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-post-cms` | 50.41 | 57 | 49.89 | — | 0 | 0 | — | — | — | — | 2.4 KB | 9.3 KB |
| `sync-post-cms-first` | 691.96 | 721.56 | 671.02 | — | 0 | 0 | — | — | — | — | 52.6 KB | 312.5 KB |
| `sync-deleteCmd-post-cms` | 17.92 | 21.55 | 17.63 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-content-post-cms` | 65.02 | 84.62 | 64.58 | — | 0 | 0 | — | — | — | — | 6.4 KB | 34.3 KB |
| `sync-content-post-cms-first` | 273.08 | 391.1 | 201.82 | — | 0 | 0 | — | — | — | — | 269.9 KB | 1.01 MB |
| `sync-tag-cms` | 16.4 | 17.37 | 16.12 | — | 0 | 0 | — | — | — | — | 395 B | 746 B |
| `sync-tag-cms-first` | 55.65 | 180.83 | 55.08 | — | 0 | 0 | — | — | — | — | 11.5 KB | 81.5 KB |
| `sync-deleteCmd-tag-cms` | 34.59 | 54.67 | 34.26 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-content-tag-cms` | 36.34 | 49.25 | 35.68 | — | 0 | 0 | — | — | — | — | 887 B | 4.1 KB |
| `sync-content-tag-cms-first` | 190.63 | 222.7 | 187.73 | — | 0 | 0 | — | — | — | — | 12.8 KB | 159.6 KB |
| `sync-redirect-cms` | 31.18 | 36.41 | 31.07 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-redirect-cms-first` | 33.74 | 46.07 | 33.35 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-deleteCmd-redirect-cms` | 22.72 | 30.32 | 22.44 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-group-cms` 🔒 | 10.94 | 13.17 | 10.81 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `sync-group-cms-first` 🔒 | 11.27 | 12.36 | 11.06 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `sync-deleteCmd-group-cms` 🔒 | 11.14 | 12.18 | 10.96 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `sync-storage-cms` | 16.73 | 22.5 | 16.61 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |
| `sync-storage-cms-first` | 16.62 | 30.72 | 16.32 | — | 0 | 0 | — | — | — | — | 401 B | 609 B |
| `sync-deleteCmd-storage-cms` | 17.17 | 40.51 | 16.79 | — | 0 | 0 | — | — | — | — | 60 B | 56 B |

- `sync-authProvider-cms` — incremental sync — authProvider, limit 100 _(cms/src/sync.ts)_
- `sync-authProvider-cms-first` — first sync (full window) — authProvider, limit 100 _(cms/src/sync.ts)_
- `sync-deleteCmd-authProvider-cms` — incremental sync — deleteCmd (authProvider) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-language-cms` — incremental sync — language, limit 100 _(cms/src/sync.ts)_
- `sync-language-cms-first` — first sync (full window) — language, limit 100 _(cms/src/sync.ts)_
- `sync-deleteCmd-language-cms` — incremental sync — deleteCmd (language) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-post-cms` — incremental sync — post, limit 500 _(cms/src/sync.ts)_
- `sync-post-cms-first` — first sync (full window) — post, limit 500 _(cms/src/sync.ts)_
- `sync-deleteCmd-post-cms` — incremental sync — deleteCmd (post) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-content-post-cms` — incremental sync — content-post, limit 100 _(cms/src/sync.ts)_
- `sync-content-post-cms-first` — first sync (full window) — content-post, limit 100 _(cms/src/sync.ts)_
- `sync-tag-cms` — incremental sync — tag, limit 500 _(cms/src/sync.ts)_
- `sync-tag-cms-first` — first sync (full window) — tag, limit 500 _(cms/src/sync.ts)_
- `sync-deleteCmd-tag-cms` — incremental sync — deleteCmd (tag) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-content-tag-cms` — incremental sync — content-tag, limit 100 _(cms/src/sync.ts)_
- `sync-content-tag-cms-first` — first sync (full window) — content-tag, limit 100 _(cms/src/sync.ts)_
- `sync-redirect-cms` — incremental sync — redirect, limit 500 _(cms/src/sync.ts)_
- `sync-redirect-cms-first` — first sync (full window) — redirect, limit 500 _(cms/src/sync.ts)_
- `sync-deleteCmd-redirect-cms` — incremental sync — deleteCmd (redirect) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_
- `sync-group-cms` — incremental sync — group, limit 500 _(cms/src/sync.ts)_ — 🔒 not permitted for this identity
- `sync-group-cms-first` — first sync (full window) — group, limit 500 _(cms/src/sync.ts)_ — 🔒 not permitted for this identity
- `sync-deleteCmd-group-cms` — incremental sync — deleteCmd (group) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_ — 🔒 not permitted for this identity
- `sync-storage-cms` — incremental sync — storage, limit 100 _(cms/src/sync.ts)_
- `sync-storage-cms-first` — first sync (full window) — storage, limit 100 _(cms/src/sync.ts)_
- `sync-deleteCmd-storage-cms` — incremental sync — deleteCmd (storage) _(shared/src/api/sync/sync.ts (deleteCmd sibling))_

### hybridQuery
| Request | p50 | p95 | ttfb p50 | server p50 | auth | couch | db calls | db ms | docs | examined | wire | decoded |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `hybrid-by-slug` | 24.59 | 27.65 | 23.94 | — | 0 | 0 | — | — | — | — | 5.3 KB | 14.2 KB |
| `hybrid-by-parentId` | 28.17 | 32.87 | 26.86 | — | 0 | 0 | — | — | — | — | 13.3 KB | 40.9 KB |
| `hybrid-parentId-fanout-overflow` | 164.26 | 622.54 | 146.21 | — | 0 | 0 | — | — | — | — | 127 KB | 471.9 KB |
| `hybrid-pinned` | 45.69 | 59.71 | 44.87 | — | 0 | 0 | — | — | — | — | 852 B | 3.3 KB |
| `hybrid-by-tagType` | 129.17 | 224.06 | 128.27 | — | 0 | 0 | — | — | — | — | 2.9 KB | 26.6 KB |
| `hybrid-by-id-list` | 414.43 | 669 | 395.26 | — | 0 | 0 | — | — | — | — | 64.5 KB | 226.3 KB |
| `hybrid-max-limit` | 669.49 | 1399.61 | 432.5 | — | 0 | 0 | — | — | — | — | 516.4 KB | 2.15 MB |

- `hybrid-by-slug` — content by slug — single page load _(app/src/pages/SingleContent/SingleContent.vue)_
- `hybrid-by-parentId` — content by one parentId — what the fan-out actually sends _(shared/src/util/HybridQuery/queryIntrospection.ts (fanOut))_
- `hybrid-parentId-fanout-overflow` — content by parentId $in, over the 25-parent fan-out cap _(shared/src/util/HybridQuery/queryIntrospection.ts (fallback))_
- `hybrid-pinned` — pinned category feed _(app/src/components/HomePage/HomePagePinned.vue)_
- `hybrid-by-tagType` — topic listing by parentTagType _(app/src/components/ExplorePage/UnpinnedTopics.vue)_
- `hybrid-by-id-list` — content by _id list — id-diff supplement (API fans out to per-id lookups) _(shared/src/util/HybridQuery/queryIntrospection.ts (decideContentApiQuery))_
- `hybrid-max-limit` — content at the maximum allowed limit (500) — synthetic worst case _(synthetic — no call site)_

### fts
| Request | p50 | p95 | ttfb p50 | server p50 | auth | couch | db calls | db ms | docs | examined | wire | decoded |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 684.58 | 822.78 | 669.44 | — | 0 | 0 | — | — | — | — | 35.8 KB | 134.5 KB |
| `fts-rare` | 203.5 | 216.82 | 201.06 | — | 0 | 0 | — | — | — | — | 36 KB | 124.8 KB |
| `fts-miss` | 18.17 | 24 | 17.81 | — | 0 | 0 | — | — | — | — | 6 B | 2 B |
| `fts-language` | 234.74 | 307.55 | 232.83 | — | 0 | 0 | — | — | — | — | 31.3 KB | 128.9 KB |
| `fts-deep-offset` | 551.1 | 1387.52 | 527.5 | — | 0 | 0 | — | — | — | — | 81.6 KB | 297.6 KB |
| `fts-strict-sorted` | 116.24 | 322.85 | 114.41 | — | 0 | 0 | — | — | — | — | 33 KB | 121.6 KB |
| `fts-cms` | 609.96 | 1103.06 | 595.71 | — | 0 | 0 | — | — | — | — | 35.7 KB | 134.5 KB |
| `fts-multiword` | 334.22 | 750.36 | 322.31 | — | 0 | 0 | — | — | — | — | 35.7 KB | 129 KB |
| `fts-long` | 272.87 | 348.06 | 263.23 | — | 0 | 0 | — | — | — | — | 36.3 KB | 135.7 KB |

- `fts-common` — content search — frequent term ("what") _(shared/src/fts/ftsSearchApi.ts)_
- `fts-rare` — content search — rare term ("army") _(shared/src/fts/ftsSearchApi.ts)_
- `fts-miss` — content search — term with no matches _(shared/src/fts/ftsSearchApi.ts)_
- `fts-language` — content search — single language filter _(shared/src/fts/ftsSearchApi.ts)_
- `fts-deep-offset` — content search — deep pagination (offset 400) _(shared/src/fts/ftsSearchApi.ts)_
- `fts-strict-sorted` — table search — strict match, title sorted _(shared/src/fts/useServerFtsSearch.ts)_
- `fts-cms` — content search — CMS scope (all statuses) _(shared/src/fts/ftsSearchApi.ts)_
- `fts-multiword` — content search — multi-word query (synthetic) _(synthetic — stress shape)_
- `fts-long` — content search — 200-char query (synthetic) _(synthetic — stress shape)_

### other
| Request | p50 | p95 | ttfb p50 | server p50 | auth | couch | db calls | db ms | docs | examined | wire | decoded |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `protected` | 11.05 | 11.77 | 10.74 | — | 0 | 0 | — | — | — | — | 56 B | 54 B |
| `storage-status` | 209.45 | 238.48 | 209.02 | — | 0 | 0 | — | — | — | — | 20 B | 22 B |

- `protected` — GET /protected — auth guard only, no DB query of its own _(synthetic — isolates auth cost from query cost)_
- `storage-status` — GET /storage/storagestatus — bucket connectivity probe _(cms bucket overview)_

### rejects
| Request | p50 | p95 | ttfb p50 | server p50 | auth | couch | db calls | db ms | docs | examined | wire | decoded |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `reject-invalid-index` | 11.57 | 14.87 | 11.3 | — | 0 | 0 | — | — | — | — | 63 B | 75 B |
| `reject-over-limit` | 11.96 | 12.26 | 11.7 | — | 0 | 0 | — | — | — | — | 77 B | 73 B |
| `reject-crypto` | 11.66 | 30.29 | 11.45 | — | 0 | 0 | — | — | — | — | 44 B | 40 B |
| `reject-regex` | 11.64 | 12.32 | 11.42 | — | 0 | 0 | — | — | — | — | 66 B | 78 B |

- `reject-invalid-index` — rejected — unknown use_index (validator) _(synthetic — reject path)_
- `reject-over-limit` — rejected — limit above the cap _(synthetic — reject path)_
- `reject-crypto` — rejected — internal crypto doc type _(synthetic — reject path)_
- `reject-regex` — rejected — $regex operator (data-mining guard) _(synthetic — reject path)_

### Where the time goes
_No traced requests. Is the API running with `PERF_TRACE=true`?_

## Socket.io connect
| Mode | samples | connect p50 | connect p95 | handshake p50 | handshake p95 | accessMap | groups |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| app | 10 | 77.39 | 91.53 | 14.97 | 22.38 | 629 B | 3 |
| cms | 10 | 73.07 | 100.88 | 14.39 | 23.04 | 629 B | 3 |
