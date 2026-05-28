---
name: prep-task
description: Before starting a non-trivial change, surface relevant memories, ADRs, recent commits in the area, and sibling code patterns so the work starts well-grounded. Use when the user asks to "prep for X", "set me up to work on X", "what should I know before changing Y", or at the start of a session focused on a specific feature area.
---

# prep-task

Survey the context around a task **before** starting it. The goal is to surface known constraints (memories), prior decisions (ADRs), recent activity (git log), and existing patterns to match (sibling code) — so you don't repeat mistakes the user has already corrected, contradict an ADR, or re-invent a convention that already exists nearby.

This is a **read-only orientation** step. No edits. Output is a context briefing the user can scan in under 30 seconds.

## What you need from the user

The task in a sentence. Examples:

- "I want to add a new search filter for tag pinning."
- "Refactor how the CMS notification store debounces toasts."
- "Add an endpoint for batch image upload."

If the task is unclear or scope-less ("clean up the codebase"), ask for one specific area before proceeding — this skill is for focused changes, not blanket work.

## Procedure

Run these searches in parallel — they are independent.

### 1. Check memories

Read `/Users/dirk/.claude/projects/-Users-dirk-projects-bccsa-luminary/memory/MEMORY.md` and identify memories likely relevant to the task:

- `feedback_*` entries about *how* to do similar work (e.g. minimal implementation, schema upgrade strategy, no in-memory caches).
- `project_*` entries about ongoing work in the same area.
- `user_*` entries about the user's preferences/constraints.

For each match, read the full memory file (linked from MEMORY.md). Surface the relevant ones in the briefing — quote the rule and its **Why**.

Per the global instructions: a memory naming a specific file/function is a *historical* claim. Before saying "X is in file Y", verify Y still exists and contains X. Don't recommend from stale memory.

### 2. Find relevant ADRs

```sh
ls /Users/dirk/projects/bccsa/luminary/docs/adr/
```

Read titles. For any with keywords matching the task domain (auth, sync, FTS, monorepo, backwards compatibility, branching, design guidelines, z-index), open the ADR and skim. Surface ones that constrain the task.

Common ones to consider:

- ADR 0005 — Backwards compatibility (anything API-shaped).
- ADR 0009 — Server-side FTS (anything content-search-shaped).
- ADR 0003 — Branching (anything release-shaped).

### 3. Recent activity in the area

```sh
git log --oneline -20 -- <plausible-files-or-dirs>
git log --oneline --all -20 --grep="<keyword>"
```

Replace `<plausible-files-or-dirs>` with the directory the task touches (e.g. `app/src/components/Search`, `api/src/endpoints`). Replace `<keyword>` with the task's main noun (e.g. "tag", "fts", "schema").

Surface commits from the last ~30 days that touch the same code paths. They tell you what's volatile and what the latest patterns are.

### 4. Sibling code patterns

For the task's specific surface:

- **Adding a new endpoint?** Read one similar endpoint controller + service in `api/src/endpoints/` end-to-end.
- **Adding a Vue page?** Look at the page nearest in concept under `app/src/pages/` (or `cms/src/pages/`) — note the `__tests__/` colocation pattern.
- **Adding a sync query?** Read the most-similar existing watcher in `app/src/sync.ts` or `cms/src/sync.ts`.
- **New DTO field?** Read the DTO file on both sides (`api/src/dto/`, `shared/src/types/dto.ts`).
- **Schema upgrade?** Read the most recent `vN.ts` as the canonical template.

Capture the convention to match — file naming, test colocation, imports — so the new code blends in.

### 5. Sub-package CLAUDE.md

If the task is squarely in one package, read that package's `CLAUDE.md`:

- `api/CLAUDE.md`, `app/CLAUDE.md`, `cms/CLAUDE.md`, `shared/CLAUDE.md`.

These have the package-specific gotchas (e.g. shared's `vitest.setup.ts` failing on Dexie index warnings; api's strict-null-checks-off; app's render-state contract for prerender).

### 6. Cross-package risks

If the task plausibly touches contracts in the root `CLAUDE.md` table (DTO mirror, FTS, sync indexes, auth codes, schema upgrade), flag them up front so the user remembers to do the matching edits.

## Report structure

```
Task: <restate the task in one sentence>
Touches: <packages — api / app / cms / shared / playwright-tests>

## Relevant memories
- <name>: <rule> — Why: <reason>
- (or "None applicable")

## Relevant ADRs
- 000X — <title>: <one-line constraint it imposes on this task>
- (or "None applicable")

## Recent activity in the area
- <hash> <date> — <subject>
- <hash> <date> — <subject>
- (last 3-5 commits in the same files/area)

## Patterns to match
- <file:> — <convention to follow, e.g. "tests live in __tests__/ sibling folder">
- <file:> — <pattern, e.g. "all DTOs use @Expose() on persisted fields">

## Cross-package contracts at risk
- <e.g. "Will touch api/src/dto/PostDto.ts — also edit shared/src/types/dto.ts (PostDto type)">
- (or "None expected")

## Suggested first step
- <one concrete file to open / sketch to draw / question to resolve before coding>
```

Keep each section terse — bullets, not paragraphs. The user is about to start work; don't drown them in pre-reading.

## What this skill is NOT

- Not an implementation. Briefing only.
- Not a planning doc. No multi-week roadmaps. The output is "what to read before touching the keyboard".
- Not a memory writer. Read memories; don't update them here (the conversation will surface new ones naturally).
- Not exhaustive. If a section turns up nothing relevant, say "None applicable" and move on — don't pad.
