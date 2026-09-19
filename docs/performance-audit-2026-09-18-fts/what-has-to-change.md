# FTS performance audit — what actually has to change

Briefing. Every number below is measured on three seeded databases (3k / 15k / 60k content
documents) against a local API with tracing on, plus one causal probe. Detail and raw data
live beside this file; the evidence for each claim is indexed in `EVIDENCE.md`.

One endpoint, `POST /fts`, and one mechanism: a search reads a number of trigram-view rows
proportional to the corpus, and nothing in the current design caps that. Three changes
address it at three different depths. None of them is a one-line fix, and #2 needs a
relevance decision before it can be a fix at all.

---

## 1. Put the language in the trigram view key

**The change:** key `fts-trigram-index` on `[trigram, language]` instead of `trigram`
([`fts-trigram-index.json`](../../api/src/db/designDocs/fts-trigram-index.json)), and have
`searchWithStats` query with `startkey`/`endkey` per language instead of filtering `language`
in JS after the fetch
([`ftsSearch.service.ts`](../../api/src/endpoints/ftsSearch.service.ts), the survivor loop
around line 337).

**Why it's slow now:** the language filter is applied in JS to rows that CouchDB has already
read, serialised and sent. `fts-language` at 60k keeps 10 221 of 29 751 survivors — a third —
at *exactly* the cost of keeping all of them (1 016 ms vs 1 040 ms). Two-thirds of the scan
is discarded after being paid for.

**Why it applies to real traffic:** the app's content search always sends one language
(`ftsSearchApi`, see [`catalogue.ts:410`](../../api/scripts/perf/catalogue.ts#L410) — "sends
at most one language, never a set"). Every production search is an `fts-language`-shaped
request.

**Evidence:** `report.md` §"What the data says", third bullet; `fts-60k.json` rows
`fts-common` vs `fts-language`.

**Expected effect:** candidate rows ÷ (number of languages) with no change to which
documents can match — a seek on the key, not a filter on the value. On the 60k series,
`fts-language` would read ~27 800 rows instead of 83 416, so ~350 ms instead of ~1 s. This is
the same shape as the 8 September tag-sync fix: use a key that already scopes the walk.

**Risk / before shipping:** a new design doc means a full view build on every environment
(25 min on 60k locally; production size unknown) and a period where old and new views
coexist on disk. The `types`/aux path (`fts-trigram-index-user`, `-redirect`) is separate and
unaffected. Relevance is unchanged: the candidate *set* for a given language is identical,
only its cost moves.

**How we'd verify:** re-run `npm run perf:audit -- --db=luminary-perf-60k --suites=fts
--fts-term=message --fts-rare-term=habitat` with the new view; `fts-language` `cand. rows`
should fall to ~28 000 and its top-20 (`fts-top20-before.txt` style capture) should be
unchanged.

## 2. The min-trigram floor makes the budget a no-op — needs a design decision, not a constant

**The mechanism:**
[`ftsSearch.service.ts:287-295`](../../api/src/endpoints/ftsSearch.service.ts#L287-L295).
The three rarest trigrams are always kept; `FTS_CANDIDATE_ROW_BUDGET = 3000` only stops the
fourth and later. Since each trigram's document frequency grows with the corpus, the floor
alone exceeds the budget from ~2 500 documents and the scan is unbounded from there.

**Evidence:** all nine shapes `budgetBound` at all sizes; scan ×19.94 for docs ×20; the
probe (`FTS_MIN_TRIGRAMS` 3 → 1) divides the scan by 3.5 and latency by 3.2 with an identical
top-20 on `message` (`fts-60k-min1.*`, `fts-top20-*.txt`).

**Why it is not "set the floor to 1":** the floor is what keeps fuzzy matching alive — a
document that has two of three trigrams of a misspelled query is still a candidate. The probe
showed no top-20 change on one exact-word query in a synthetic corpus; that is one data point
on relevance, not a relevance study. And applying the budget *before* the floor is worse
still: by 15k the single rarest trigram of `message` already has df 5 980 > 3 000, so a
strict budget would keep zero trigrams and return nothing.

**What the decision is:** the budget was designed as an absolute row count on a corpus where
that meant something. On a large corpus it needs to be either

- *relative* — a cap expressed as a share of the corpus or as a target row count that the
  floor may exceed only by a bounded factor;
- *per-trigram* — read at most N rows per kept trigram (cheap, but ranking then works from
  an arbitrary prefix of the postings and quality becomes order-dependent);
- or *replaced* — by a key design (#1) that makes the rows cheap enough for the floor not to
  matter.

Each trades cost against recall differently, and the trade needs to be measured on real
documents with real queries, not on this corpus. This is an ADR-shaped decision, like the
8 September finding #2 on permission filtering.

**How we'd verify:** whatever is chosen, re-run the three-size series; the success criterion
is `cand. rows` for `fts-common` growing sub-linearly with N, and a top-K comparison against
the current ranking on a real corpus.

## 3. Trigram view rows are heavy — 11.6 µs each

**The mechanism:** every row of `fts-trigram-index` carries eleven fields
(`weight, parentType, status, publishDate, expiryDate, language, memberOf, parentTags,
updatedTimeUtc, title, author`) so that permission and visibility filtering can run without
fetching documents. That was the right call when the scan was small. At 83 416 rows the
serialisation and transfer of those fields *is* the cost: 11.6 µs per row on CouchDB's side
against 0.47 µs on the JS side.

**Evidence:** the fitted slope (`report.md` §"Scaling data"); `couch-view-state.py` shows the
view at ~62 KB per document, 15–17× the database file it indexes.

**The change, if #1 and #2 are not enough:** a lean view for the scan (`[trigram, language]`
→ `[weight, docId]` or similar) plus a second by-key fetch of filter metadata for the
survivors only. Survivors are a third of candidates on this corpus and fewer on a real one;
the second fetch is bounded by them, not by the scan.

**Risk:** two round trips instead of one, and the survivor fetch is itself a keyed read of
tens of thousands of documents on a large corpus. This is a measurement to make, not a change
to assume. Do #1 first; if the per-row cost after #1 still dominates, this is the next lever.

**How we'd verify:** the fitted slope in µs per candidate row on the same 60k database,
before and after.

## 4. Index hygiene — hand-off

`sync-post-content-index` is deployed on every database and referenced by no code since the
8 September tag-sync fix moved tags to `sync-tag-content-index` and left posts on the generic
`sync-content-index`. It is on the 8 September §6 "unused indexes" list's successor and
belongs to that thread, not this one. Reported here because the index suite flagged it on all
three runs.

## How this relates to the 1 September findings

- **Finding #3 — "search competes with every other request" (60 % JS).** Qualified, not
  contradicted. On this corpus JS is 4 %; the difference is document length (243 words seeded
  vs real articles) and the BM25 re-scoring of 150 top-K documents that scales with it. What
  this audit adds: on a large corpus the CouchDB scan is the ceiling regardless, and it holds
  the connection pool for ~1 s per search at 60k. The 19.5 req/s ceiling measured on 2 423
  documents will not survive corpus growth. The recommended first lever — capping the
  pagination window — decays from +52 % to +4 % between 3k and 60k and is not the place to
  start on a large corpus.
- **Finding #2 — "permission filtering cannot seek".** Same shape, different endpoint:
  language, status and permission on `/fts` are post-filters over view rows, exactly as the
  Mango permission clauses are post-filters over index rows. Change #1 above is the FTS
  instance of the same remedy.
- **Unknowns §2 — "does read amplification stay proportional as the corpus grows?"** For
  `/fts`: yes, exactly proportional, R² = 1.0000 over ×20. Closed.

## Priority order

| # | Change | Effort | Payoff | Where |
| --- | --- | --- | --- | --- |
| 1 | Language in the trigram view key | new design doc + service query change + rebuild | ÷3 on every app search, no relevance change | `fts-trigram-index.json`, `ftsSearch.service.ts` |
| 2 | Floor / budget design decision | ADR + relevance study on a real corpus | bounds the scan; up to ÷3.5 shown by the probe, recall cost unknown | ADR, then `ftsSearch.service.ts` |
| 3 | Lean scan view + survivor fetch | design doc + two-phase read | reduces µs per row; only if #1 is not enough | measure first on 60k |
| 4 | Drop `sync-post-content-index` | one design doc | write throughput | 8 September §6 thread |

Do #1 regardless of #2: it is a pure cost change with no relevance exposure, it matches how
the app actually queries, and it is verifiable in an afternoon on the 60k database that is
already seeded and compacted on the audit machine.
