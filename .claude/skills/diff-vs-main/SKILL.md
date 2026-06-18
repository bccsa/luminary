---
name: diff-vs-main
description: Summarize what the current branch changes versus origin/main (committed + uncommitted) and flag cross-package contract risks specific to this monorepo. Use when the user asks "what's different from main", "what would this PR contain", "diff against main", "review my branch", or anything similar before opening or refining a PR.
---

# diff-vs-main

Produce a tight pre-PR summary: what changed against `origin/main`, what risks the change introduces given this repo's cross-package contracts, and what looks untested.

## What this skill is NOT

- Not a code review — don't critique style, naming, or correctness line-by-line. Use `/code-review` for that.
- Not a PR creator — don't push, don't open a PR. Just report.
- Not a test runner — flag untested areas; don't run e2e/playwright (user runs those).

## Procedure

### 1. Gather state (run in parallel)

Run these in a single message, all parallel:

- `git fetch origin main --quiet` — needed because local `main` may be stale.
- `git status --short` — uncommitted changes.
- `git rev-parse --abbrev-ref HEAD` — current branch name.
- `git log origin/main..HEAD --oneline` — commits ahead of origin/main.
- `git diff origin/main...HEAD --stat` — committed file-level stats.
- `git diff --stat` — unstaged stats.
- `git diff --cached --stat` — staged stats.

If `git fetch` fails (offline, no remote), fall back to local `main` and **say so in the report**.

### 2. Get the actual diffs

Once you know which files changed, fetch the diffs you need:

- `git diff origin/main...HEAD -- <files>` for committed changes.
- `git diff -- <files>` + `git diff --cached -- <files>` for working-tree changes.

Don't dump the entire diff into context if it's large. Read selectively: enough to understand intent and spot the risks below. If a file's diff is huge (>500 lines), summarize from the stat + spot-read the most important hunks.

### 3. Check cross-package contracts

This monorepo has known seams that break silently when one side changes without the other. **Check each of these against the changed-file list and flag mismatches:**

| If this changed… | …also expect a change in | Reason |
|---|---|---|
| `api/src/dto/**` (DTO fields) | `shared/src/types/dto.ts` | DTOs are mirrored; API and clients must agree on shape. |
| `shared/src/types/dto.ts` | `api/src/dto/**` | Same — bidirectional. |
| `api/src/util/ftsIndexing.ts` | `shared/src/fts/ftsSearch.ts` | FTS field config + boosts must stay identical (ADR 0009). |
| `shared/src/fts/ftsSearch.ts` | `api/src/util/ftsIndexing.ts` | Same — bidirectional. |
| New Mango sync queries in `app/` or `cms/` | `api/src/db/designDocs/sync-*-index.json` (registers both the index and the `use_index` name via `api/src/db/indexNameRegistry.ts`) | New sync queries need a matching design doc; `/query` validation (`api/src/validation/query/validateQuery.ts`) rejects an unknown `use_index`. No per-query-type validator entry exists anymore. |
| `api/src/auth/**` `AuthFailureReason` codes / payloads | `app/src/main.ts` + `cms/src/main.ts` `connect_error` handler | Failure codes drive client-side eviction / silent refresh. |
| `shared/src/**` (any) | App/CMS rebuild + re-install with `--install-links` | Consumers link against `shared/dist`; stale dist = stale behavior. Flag if a shared change exists and `app/package-lock.json`/`cms/package-lock.json` weren't touched, OR remind user to rebuild + reinstall before testing. |
| `api/src/db/schemaUpgrade/**` | `_schemas.schemaVersion` bump (visible in the same file) | Schema upgrades must bump the version on success. |
| `api/src/validation/query/validateQuery.ts` (validation rule change) | `shared/src/api/sync/syncBatch.ts` + `shared/src/util/hybridQuery/HybridQuery.ts` payload shapes | Tightening the universal validator can reject deployed-client queries (ADR 0005). |

Don't invent additional contracts — only flag the ones in this table.

### 4. Check for untested areas

For each changed source file (excluding config, docs, markdown):

- Look for a sibling `*.spec.ts` / `*.test.ts` or a `__tests__/` directory.
- If neither the test file itself nor a sibling test was modified, list the file under "untested".

Exclusions (don't flag as untested):
- `*/main.ts`, `*/auth.ts`, `*/guards/**`, `*/analytics.ts` in `app/` and `cms/` (excluded from coverage by config).
- `api/src/db/schemaUpgrade/**` (excluded from API coverage).
- Pure type-only files (`*.d.ts`, files containing only `export type`/`export interface`).
- `*.md`, `*.json`, `*.yml`, `*.config.ts`, `Dockerfile`, etc.

### 5. Report

Output in this exact structure. Keep each section terse — bullet points, not paragraphs.

```
Branch: <name>  vs  origin/main
Commits ahead: <N>   Files changed: <N committed> + <N uncommitted>

## Changes by package
- api/        — <N files>: <one-line gist>
- shared/     — <N files>: <one-line gist>
- app/        — <N files>: <one-line gist>
- cms/        — <N files>: <one-line gist>
- (skip packages with no changes)

## Cross-package risks
- <risk 1, citing the rule from the table and the file:line that triggered it>
- <risk 2…>
- (or: "None detected" if clean)

## Untested
- <file path> — <one-line note on what's new>
- (or: "All changed files have adjacent test edits")

## Notes
- <only include if something is worth surfacing: stale fetch, huge diff skipped, etc.>
```

If the report finds zero changes (`git diff origin/main...HEAD` is empty and working tree is clean), say so in one line and stop.

## Tone

This is a sanity check, not an audit. Bullets, file paths, line numbers. No prose padding. No "looks good!" — just the facts; the user will decide what's good.
