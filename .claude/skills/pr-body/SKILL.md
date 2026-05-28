---
name: pr-body
description: Generate a PR title and body from the current branch's diff against origin/main. Use when the user asks to "draft a PR body", "write a PR description", "PR title for this branch", or is about to open a PR and wants the description prepared.
---

# pr-body

Generate a PR title + body from the current branch's diff vs `origin/main`. Output ready-to-paste markdown matching the conventions used in recent merges on `main`.

This is a **drafting** skill — it produces text. It does **not** push, create the PR, or run `gh pr create`. The user reviews and runs the create command themselves (or asks you to in a follow-up).

## What you need from the user

Usually nothing — just run. But if the branch is on `main` or has zero commits ahead of `origin/main`, ask: "There's nothing to PR yet — did you mean a different branch?" and stop.

## Procedure

### 1. Gather state

Run in parallel:

- `git fetch origin main --quiet` (skip silently if offline; note in report)
- `git rev-parse --abbrev-ref HEAD` — current branch
- `git log origin/main..HEAD --oneline` — commits in this PR
- `git diff origin/main...HEAD --stat` — file-level change scope
- `git log -20 --pretty=format:"%s" main` — recent merged PR titles, to match style

### 2. Read recent merged-PR titles to match style

The first 5-20 commit subjects from `git log main` show the project's title conventions. Common patterns in this repo (observed from recent commits):

- Prefix with the package: `APP:`, `CMS:`, `API:`, `Shared:`. Example: "APP: add a trigger field to indicate if dom has been populated (#1635)".
- Sentence case after the prefix.
- "Fix:" prefix (no package) for cross-cutting fixes: "Fix: Skip stale deleteCmd when local doc is newer (#1628)".
- Trailing `(#NNNN)` is added by GitHub on merge — don't include it in the draft.

Pick the convention that matches what *this* branch touches. If it touches one package, prefix with that package. If multiple, no prefix or use the dominant one.

### 3. Read the actual diff

Use `git diff origin/main...HEAD -- <files>` for the files in the stat. Read enough to understand the *why* of each change, not just the *what*. Goals:

- One-sentence summary of what the PR does.
- 2-5 bullets of substantive changes (skip trivial reformats, lint fixes).
- Any non-obvious decisions or trade-offs to surface.
- Test coverage notes.

Don't include the raw diff in the PR body. Reviewers click "Files changed" for that.

### 4. Compose the body

Output exactly this structure (use the project's style — no marketing copy, no "this PR introduces…"):

```
<Title — see step 2 conventions, <70 chars, no trailing period>

## Summary
- <one-line of what this delivers, written from the user/system perspective>
- <one-line of how (high level approach), if non-obvious>
- <one-line of any tradeoff or follow-up worth flagging>

## Changes
- <file or area> — <what changed and why>
- <file or area> — <what changed and why>
- (3-5 bullets max; bundle small related edits)

## Test plan
- [ ] <test step 1 — describe an observable behaviour to verify>
- [ ] <test step 2>
- [ ] <test step 3>
- (3-5 items; one per behaviour, not one per file)

<Optional sections, only if applicable:>

## Cross-package contracts touched
- DTO mirror: <api/X vs shared/Y — confirmed in sync>
- FTS config: <api/util/ftsIndexing.ts and shared/fts/ftsSearch.ts — both updated>
- New sync query: <design doc + validator updated>

## Notes
- <anything that helps the reviewer but doesn't fit above — e.g. "depends on PR #N", "requires API restart for new design doc">
```

### 5. Self-check before reporting

- Title under 70 chars.
- Summary bullets describe *outcomes*, not file lists.
- Test plan items are *behaviours*, not "run tests" (that's a CI concern).
- "Cross-package contracts" section only present if the diff actually touched those seams (use the same checks from `/diff-vs-main`).
- No marketing language ("seamless", "powerful", "robust"). No `🤖 Generated…` trailer. The user adds those if they want.

### 6. Output and stop

Print the full PR body in a fenced markdown block so the user can copy it. End with one line telling them how to use it:

```
Paste this into a `gh pr create --title "<title>" --body "..."` invocation, or copy into the GitHub PR composer.
```

Do not actually run `gh pr create`. Do not push.

## What this skill is NOT

- Not a PR opener. The user reviews and submits.
- Not a code reviewer. Don't critique the diff — describe it.
- Not a diff dumper. The PR body summarizes; the diff itself is one click away.
- Not for issue templates. Use the issue templates in `.github/ISSUE_TEMPLATE/` for those.

## Pair with `/diff-vs-main`

For a sanity check on the branch before drafting, run `/diff-vs-main` first — it flags cross-package contract risks that may belong in the "Notes" section here.
