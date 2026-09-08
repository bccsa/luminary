# Evidence index

Every claim in `what-has-to-change.md` → the file that proves it and how to re-run it.

Two kinds of measurement:
- **Production A/B** — raw HTTPS against `api.app.bcc.africa`, anonymous, alternating
  request order, SHA-256 of the returned ID list to prove same result. Bypasses the
  client so only the server path is measured.
- **Local `_explain` / two-instance** — against `luminary-perf-pr1818-20260908`, a
  CouchDB replica of `luminary-local` (6 356 docs). Local absolute times are not
  production times; the *ratios*, *index chosen*, and *rows examined* are.

---

## §1 Tag sync — 359 ms → 71 ms

| | |
|---|---|
| Data | `tag-index-confirmation.json` (15 samples/variant, production) |
| Runner | `tag-index-confirm.cjs` — original lives at `api/perf-reports/query-sync/` |
| Narrative | `report.md` §"Strongest result: the tag-sync index" |

Verified numbers from that JSON:

```
sync-content-index      median 358.5 ms   scan-warning 15/15
sync-tag-content-index  median  70.5 ms   scan-warning  0/15
distinct docId-order hashes across both variants: 1  (identical result set)
```

Also in `index-comparison.json` (5-query A/B, `query-index-ab.cjs`):
`sync-content-tag-first` 447 ms → 69 ms.

Regression origin: `report.md` §"Where the index choice changed" — commit
`35ee02b2`, PR #1645, 18 Jun. `git show 35ee02b2 -- shared/src/api/sync/syncBatch.ts`.

Index definitions compared: `api/src/db/designDocs/sync-content-index.json` (partial
filter `type=content` only) vs `sync-tag-content-index.json` (partial filter
`type=content, parentType=tag`).

---

## §2 ID-list `_id: {$in}` — 208 ms → 3 ms

| | |
|---|---|
| Data | `trace-idlist-output.txt` (captured run) |
| Runners | `trace-idlist.cjs` (`_explain` + `execution_stats` on 5 selector variants), `trace-idlist2.cjs` (`_all_docs?keys` vs Mango scan) |
| Production baseline | `report.md` table row `hybrid-by-id-list` — 462 ms, scan warning; and `measurements.json` |

`trace-idlist.cjs` output — CouchDB's own plan for the shape the client sends:

```
{_id:$in} only              → _all_docs        6356 examined   367 ms
{type, _id:$in}             → type-index       2423 examined   214 ms
{type,_id:$in,memberOf}     → type-index       2423 examined   204 ms   ← what runs today
pin use_index=_all_docs     → rejected, falls back to type-index scan
```

`trace-idlist2.cjs` output — the fix:

```
_all_docs?include_docs=true  keys:[…25]   →  25 docs   2.9 ms   (25 rows touched)
_find {type,_id:$in}                       →  25 docs 205.5 ms   (2423 examined)
```

Reproduce (needs the local replica DB; no API required):

```sh
cd docs/performance-audit-2026-09-08 && node trace-idlist.cjs && node trace-idlist2.cjs
```

`_all_docs?keys` precedent in the codebase: `api/src/endpoints/ftsSearch.service.ts`
already fetches its top-K by key this way.

---

## §3 Multi-parent / #1818

| | |
|---|---|
| Data | `pr1818-comparison.json` (20 samples/shape) + `pr1818-local-measurement.md` (full write-up) |
| Runner | `pr1818-replay.cjs` |
| Method | two API instances on the same replica DB — baseline `afaa5b75`, candidate `afaa5b75` + `git merge 82e528ba` (#1818 head); both with `PERF_TRACE` |

Verified from the JSON:

```
                                    baseline            branch+#1818
hybrid-by-id-list          200  229ms find×1 ex2423   200  229ms find×1 ex2423   (untouched — §2's problem)
parentId $in  (+sort)      500                          200   40ms find×40 ex131   (fixed)
parentId $in  (no sort)    200   52ms find×1  ex302    200 3990ms find×40 ex96920  (regression — the gap)
parentId  single (control) 200    7ms                  200    7ms                  (no change)
```

The no-sort regression cause is read directly from the merged
`query.service.ts executeQuery` — it spreads `...query` into each sub-query and
overrides only `selector` + `use_index`, never synthesizing a sort; the PR's
`query.service.spec.ts` fan-out tests all pass a `publishDate` sort. Posted as a
review on the PR.

---

## §4 Post-sync payload

`report.md` §"What the data says" → `sync-content-post-first`: 100 docs, 251 ms
median, 1.09 MiB decoded / 351 KiB transferred, "about 476.5 KB of serialized FTS
values and 529.0 KB of article text". Field-level byte breakdown per request is in
`measurements.json` (`fieldBytes` per entry) and `api/perf-reports/production/wire-diagnostics.json`.

---

## §5 Auth path / #1719

Not measured here — stated as such. The per-request cost is from **reading the code**:
`api/src/auth/auth.guard.ts` → `AuthIdentityService.resolveOrDefault` (RS256 verify,
user Mango lookups, `lastLogin` write). #1719's own PR description enumerates it
("RS256 verify + 3-4 Mango user lookups + a lastLogin write + accessMap projection").
`report.md` coverage note and `api/scripts/perf/README.md` §"Running authenticated"
both flag that the anonymous run does not exercise this. To measure:
`node api/scripts/perf/local-issuer.mjs editor1` then `npm run perf:audit -- --token=…`.

---

## §6 Unused indexes

`api/perf-reports/perf-audit-2026-09-08T10-04-47-090Z.md` §Findings →
"11 deployed index(es) with no code reference", with per-index disk sizes. Generated
by the audit's `indexes` suite (`api/scripts/perf/suites/indexes.ts`), which
cross-references every design doc against `use_index` strings found in the client
source.

---

## Source audit reports (gitignored — output dir — but on disk)

- `api/perf-reports/perf-audit-2026-09-08T10-04-47-090Z.{md,json}` — full local audit
- `api/perf-reports/production/perf-audit-2026-09-08T10-12-16-196Z.{md,json}` — production latency/fts/socket
- `api/perf-reports/query-sync/` — the focused /query + sync study (`report.md`, `measurements.json`, runners)
- `api/perf-reports/production/comparison.md`, `wire-diagnostics.json`

The `docs/performance-audit-2026-09-08/` copies here are the durable subset.
