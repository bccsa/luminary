---
name: log-ticket
description: Create or modify a Luminary ticket — a GitHub issue in bccsa/luminary on the Luminary Development project board with Status (column), Priority, Size, and Complexity set. Use when the user says "log a ticket", "create a bug ticket", "file an issue", "add a ticket to the board", "make a P2 for…", or wants to change an existing ticket ("move issue X to In progress", "bump #1712 to P1", "relabel that ticket", "edit the ticket title/body").
---

# log-ticket

Files a ticket on the **Luminary Development** GitHub project board
([github.com/orgs/bccsa/projects/4](https://github.com/orgs/bccsa/projects/4)).
A "ticket" here = a GitHub issue in `bccsa/luminary` that is added to the
board with its single-select fields (Status, Priority, Size, Complexity) set.
This is the workflow behind issues like #1712 and #1722.

The work is done by [driver.mjs](driver.mjs) (paths are relative to this skill
dir). It **creates** a new ticket, or **modifies** an existing one (pass
`--issue`). It resolves field option IDs **at runtime** from `gh project
field-list` (survives options being renamed) and resolves the board item id via
the idempotent `gh project item-add` — so it never scans the 860+ item board
(that trips GitHub's secondary rate limit). Only dependency: an authenticated
`gh` CLI.

## Prerequisites

`gh` must be authenticated with access to `bccsa/luminary` and the org project:

```bash
gh auth status
```

## Run (agent path)

Always dry-run first to validate field values (it catches typos like `P9`
before creating anything):

```bash
node .claude/skills/log-ticket/driver.mjs --title "APP: <summary>" \
  --label bug --status Ready --priority P2 --size XS --complexity Medium --dry-run
```

Then create for real (drop `--dry-run`):

```bash
node .claude/skills/log-ticket/driver.mjs \
  --title "API: Add DoS protection to the FTS endpoint" \
  --body "Mirror the /query endpoint's validation on the FTS endpoint." \
  --label security --label enhancement \
  --status Ready --priority P2 --size S --complexity High
```

It prints the issue URL on success.

### Modify an existing ticket

Pass `--issue <number|url>` and **only the flags you want changed**. Nothing
else is touched. Examples (all verified this session):

```bash
# move a ticket to a new column and bump priority
node .claude/skills/log-ticket/driver.mjs --issue 1712 --status "In progress" --priority P1

# rename, swap labels
node .claude/skills/log-ticket/driver.mjs --issue 1712 \
  --title "APP: clearer title" --add-label enhancement --remove-label bug
```

In modify mode the board is touched **only if** you set a field flag (so a
pure title/body/label edit won't drag the issue onto the board). Dry-run works
the same: add `--dry-run`.

### Flags

| Flag | Notes |
|---|---|
| `--issue <num\|url>` | modify this existing issue instead of creating. Without it, a new issue is created. |
| `--title` | **required when creating.** Must start with a folder prefix — see [Title prefix rules](#title-prefix-rules). |
| `--body` / `--body-file` | issue body (markdown). |
| `--label` / `--add-label` | add a label (repeatable). Real repo labels: `bug`, `enhancement`, `security`, `housekeeping`, `documentation`, `test`, `new feature`, `Research`. |
| `--remove-label` | remove a label (repeatable; modify mode). |
| `--status` (alias `--column`) | board column: `To triage`, `Backlog`, `Ready`, `In progress`, `Changes requested`, `In review`, `Approved`, `On Hold`, `Done`. |
| `--priority` | `P0`, `P1`, `P2`. |
| `--size` | `XS`, `S`, `M`, `L`, `XL`. |
| `--complexity` | `Low`, `Medium`, `High`. |
| `--repo` | default `bccsa/luminary`. |

All field flags are optional — only the ones you pass get set. Match labels
to the work: `bug` for defects, `enhancement`/`security` for improvements.

## Title prefix rules

Every ticket title is prefixed with the mono-repo folder / application it
concerns, followed by `: `:

| Prefix | Folder |
|---|---|
| `APP` | `app/` (offline-first PWA) |
| `API` | `api/` (NestJS backend) |
| `CMS` | `cms/` (CMS SPA) |
| `Shared` | `shared/` (luminary-shared lib) |
| `docs` | `docs/` (ADRs, architecture) |

- A ticket that spans multiple folders lists **all** of them, comma-separated,
  in the order they appear, then a single colon:
  - `Shared, APP: Ticket to do something great`
  - `CMS, API: duplicate image on post duplication`
- Use the prefix that matches the folder doing the work, not where the symptom
  shows. Pick the closest fit; when genuinely unsure, ask the user.

## Verify

Read a single issue's board field values directly — **do not** `item-list` the
whole board (860+ items trips GitHub's secondary rate limit):

```bash
gh api graphql -f query='
  query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){
    projectItems(first:5){nodes{project{number}
      fieldValues(first:30){nodes{... on ProjectV2ItemFieldSingleSelectValue{
        name field{... on ProjectV2FieldCommon{name}}}}}}}}}}' \
  -F o=bccsa -F r=luminary -F n=<ISSUE_NUMBER> \
  --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number==4)
        | .fieldValues.nodes[] | select(.field!=null) | "\(.field.name)=\(.name)"'
```

## Gotchas

- **Two single-select systems, don't confuse them.** "Column / Status",
  "Priority", "Size", "Complexity" are **GitHub Projects** board fields — NOT
  Teamwork, and NOT GitHub issue labels. A new ticket request with those words
  belongs on board #4. (The repo's `bug`/`enhancement` labels are separate and
  set via `--label`.)
- **Adding an issue to the board leaves every field unset.** `item-add` does
  not apply a default Status — the driver sets fields in a second step. If you
  add an issue by hand, remember the fields stay blank.
- **Never scan the board to find an item.** `gh project item-list` over 860+
  items burns the GraphQL quota and trips the secondary rate limit (`API rate
  limit exceeded for user ID …`). The driver resolves item ids via the
  idempotent `gh project item-add` instead; verification uses the targeted
  single-issue query above. If you do get rate limited, `gh api rate_limit
  --jq .resources.graphql` shows the reset time — wait it out, don't retry.
- **`item-add` is idempotent.** Calling it for an issue already on the board
  returns the existing item id (no duplicate) — that's how modify mode finds
  the item without searching.
- **Field option IDs are not stable across boards/edits.** Never hardcode them
  — the driver always re-reads them from `gh project field-list`. If a value
  errors, run `gh project field-list 4 --owner bccsa --format json` to see the
  current option names.
- **Project owner is the org (`bccsa`), repo is `bccsa/luminary`.** The project
  number is `4`; the driver resolves its node id via `gh project view`, so you
  never pass it.

## Troubleshooting

- `error: "<x>" is not a valid <Field>` — typo in a field value; the message
  lists the valid options. Fix and rerun.
- `gh: To use GitHub CLI in a GitHub Actions workflow…` / auth errors — run
  `gh auth login` (needs `project` scope: `gh auth refresh -s project`).
- Issue created but not on board — check the `gh project item-add` step didn't
  fail on the `project` OAuth scope; re-run `gh auth refresh -s project,read:project`.
- `gh … failed: GraphQL: API rate limit exceeded for user ID …` — secondary
  rate limit (usually from someone scanning the board). Run `gh api rate_limit
  --jq .resources.graphql` for the reset time and wait; the driver surfaces this
  as a clean one-line error rather than a stack trace.
