# Evidence index

Every claim in `report.md` and `what-has-to-change.md` → the file that proves it and how to
re-run it.

Two kinds of measurement:

- **Harness runs** — `npm run perf:audit` against a local API with `PERF_TRACE=true`, on
  three seeded databases. Server-side timings and stage counters come from the API's own
  `X-Perf-Trace` header, so they exclude the audit client and the network. Output is
  `fts-{3k,15k,60k}.json` / `.md` and the probe run `fts-60k-min1.*`.
- **Direct CouchDB probes** — `trigram-df.py` and `couch-view-state.py`, reading the
  trigram view and `_info` endpoints. These establish what the corpus *is*, independently of
  the API.

The JSON files here are the harness output with one edit: `context.content` (the 200
documents discovery sampled, each carrying its 684-entry `fts` array — 3 MB per file) is
replaced by a one-line note. Everything the report cites is intact. The unedited originals
are on the audit machine under `api/perf-reports/` (gitignored).

---

## §1 Linear scan — 4 184 → 20 856 → 83 416 rows

| | |
| --- | --- |
| Data | `fts-3k.json`, `fts-15k.json`, `fts-60k.json` — `fts[]`, fields `candidateRows`, `survivors`, `totalMs`, `total.p95`, `dbMs`, `searchMs` |
| Runner | `npm run perf:audit -- --db=luminary-perf-<size> --suites=indexes,fts --samples=15 --warmup=3 --fts-term=message --fts-rare-term=habitat` |
| Narrative | `report.md` §"Strongest result", §"Scaling data" |

Verified numbers from those files (`fts-common`):

```
size   content   candidateRows   ×vs3k    p50 ms   dbMs    searchMs-dbMs
3k       3 000         4 184     1.00      82.3    74.2     7.6
15k     15 000        20 856     4.98     290.6   270.4    19.7
60k     60 000        83 416    19.94   1 040.2   993.0    46.4
```

Least-squares fit of `dbMs` against `candidateRows` over the three points: slope 11.6 µs,
intercept 27 ms, R² = 1.0000. Same fit on JS (`searchMs − dbMs`): slope 0.47 µs, intercept
7 ms, R² = 0.9882. Reproduce with any three-point linear regression on the columns above.

`budgetBound` is `true` for all nine non-miss shapes in all three files
(`candidateRows ≥ candidateRowBudget`, budget 3 000).

## §2 Causal probe — floor 3 → 1

| | |
| --- | --- |
| Data | `fts-60k-min1.json` / `.md` (60k database, `FTS_MIN_TRIGRAMS = 1`) against `fts-60k.json` (same database, `= 3`) |
| Result identity | `fts-top20-before.txt`, `fts-top20-after.txt` — ordered `_id` list from `POST /fts {"apiVersion":"0.0.0","queryString":"message"}`, taken with the constant at 3 and at 1 |
| Change | [`api/src/endpoints/ftsSearch.service.ts:95`](../../api/src/endpoints/ftsSearch.service.ts#L95), reverted after the run — not committed |
| Narrative | `report.md` §"Causal probe" |

Verified numbers:

```
                       floor=3        floor=1     ratio
fts-common  kept             3              1
            candidateRows  83 416        23 914     3.49
            p50 ms        1 040.2         322.0     3.23
fts-rare    candidateRows  67 173        22 391     3.00
            p50 ms          803.6         301.0     2.67
```

`diff fts-top20-before.txt fts-top20-after.txt` → empty (20 lines each).

`23 914` = the 60k document frequency of `mes`, the rarest usable trigram of `message`
(1 196 at 3k per `trigram-df.py`, ×20). With one trigram kept, `survivors = candidateRows`:
no duplicate rows to fold.

## §3 DB vs JS split

| | |
| --- | --- |
| Data | same three JSON files — `dbMs` (sum of CouchDB round-trip time in the trace), `searchMs` (the `search` span around `searchWithStats`), `total.p50` |
| Definition | JS ≈ `searchMs − dbMs`; the remainder to `totalMs` is auth + framework, ~0.5 ms |
| Narrative | `report.md` §"What the data says", first bullet |

At 60k across the eight real shapes: `dbMs` 770–1 020 ms, JS 28–59 ms, JS share 3–5 %.

## §4 Search-term selection — why `message` / `habitat`

| | |
| --- | --- |
| Runner | `trigram-df.py luminary-perf-3k 3000` — reads df per trigram from `fts-trigram-index?group=true`, applies the service's pruning (50 %) and floor (3) to every word in the seeder's `WORDS` list |
| Narrative | `report.md` §"Audit corrections", first two paragraphs |

Output on the 3k database (18 Sept):

```
luminary-perf-3k: 1,234 distinct trigrams; pruned when df > 1500

  content    con:3000✗  ont:1701✗  nte:2936✗  ten:3000✗  ent:3000✗
  rhythm     rhy:1224  hyt:1224  yth:1224  thm:1224
  message    mes:1196  ess:3000✗  ssa:1494  sag:1494  age:3000✗
  habitat    hab:1117  abi:1117  bit:1117  ita:2612✗  tat:2047✗

words with ≥3 usable trigrams: 92/593

most expensive survivors:  message 4184   passage 3956   library 3954   temperature 3872
least expensive survivors: habitat 3351   rapidly 3357   knowledge 3360   bridge 3360
```

So: `content` is 100 % pruned (every trigram in ≥ 1 701 of 3 000 docs); `message` is the most
expensive word that survives, `habitat` the least; the whole surviving vocabulary spans only
3 351–4 184 rows. The measured `candidateRows` at 3k (4 184 / 3 351) equal these sums
exactly, which is the check that the probe mirrors the service.

## §5 Corpus and view state

| | |
| --- | --- |
| Runner | `couch-view-state.py luminary-perf-3k luminary-perf-15k luminary-perf-60k` |
| Also in | each `fts-*.json` → `indexes[]` entry `fts-trigram-index` (`diskSize`, `seqLag`, `building`) and `context.counts` |
| Narrative | `report.md` §"Reproduce and inspect" |

State at measurement time (after manual compaction, before the runs):

```
db                  content   trigram rows   view file   view active   dead   lag
luminary-perf-3k      3 000      2 051 466      186 MB        185 MB    0.1%    0
luminary-perf-15k    15 000     10 256 686      934 MB        932 MB    0.2%    0
luminary-perf-60k    60 000     41 026 204    3 752 MB      3 746 MB    0.2%    0
```

684 trigram rows per content document at every size; ~62 KB of compacted view per document
(61.8 / 62.1 / 62.4). The corpus is linear by construction; any non-linearity in the
measurements would have come from the algorithm.

Before compaction the same views read 268 MB / 1 440 MB / 4 286 MB on disk — 26 %, 31 % and
11 % dead space. The 60k build was partly compacted by smoosh while still indexing
(`VIEW_COMPACTION` in `_active_tasks` at 17 % of the build); the other two were untouched
until compacted by hand. All three were compacted with
`POST /<db>/_compact/fts-trigram-index` and re-checked before any measurement.

Fauxton's "Data size on disk" for a view is `sizes.external` (the uncompressed size, e.g.
7 579 MB for 60k), not the file size; `couch-view-state.py` prints all three.

## §6 Superseded first run — `content` / `rhythm`

| | |
| --- | --- |
| Data | `fts-3k-superseded-content-rhythm.md` (harness report, 3k, 18 Sept 10:54 UTC) |
| Narrative | `report.md` §"Audit corrections", second paragraph |

In that run `fts-common`, `fts-language`, `fts-deep-offset`, `fts-strict-sorted` and
`fts-cms` all show `kept 0 → cand. rows 0 → 0 results` at 5–7 ms: the frequent term was fully
pruned and those shapes measured nothing. `fts-rare` (`rhythm`) scanned 3 672 rows for 1 224
survivors — three trigrams with identical df pulling the same 1 224 documents three times.
The run is kept because it is what prompted §4; it is not part of the series.

## Source audit reports (gitignored — output dir — but on disk)

```
api/perf-reports/fts-3k/perf-audit-2026-09-18T10-54-05-498Z.{json,md}   content/rhythm, superseded
api/perf-reports/fts-3k/perf-audit-2026-09-18T14-36-28-380Z.{json,md}   → fts-3k.*
api/perf-reports/fts-15k/perf-audit-2026-09-18T14-50-14-875Z.{json,md}  → fts-15k.*
api/perf-reports/fts-60k/perf-audit-2026-09-18T15-38-46-292Z.{json,md}  → fts-60k.*
api/perf-reports/fts-60k-min1/perf-audit-2026-09-18T19-57-50-595Z.{json,md} → fts-60k-min1.*
```

Related: the 1 September audit this one extends is `docs/api-performance-audit-2026-09-01.xlsx`
(finding #3 and Unknowns §2); the 8 September `/query` audit is
`docs/performance-audit-2026-09-08/`.
