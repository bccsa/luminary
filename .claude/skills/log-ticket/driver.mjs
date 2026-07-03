#!/usr/bin/env node
// log-ticket driver — create OR modify a Luminary ticket: a GitHub issue in
// bccsa/luminary filed on the Luminary Development project board
// (https://github.com/orgs/bccsa/projects/4) with Status / Priority / Size /
// Complexity set.
//
// Only dependency: the `gh` CLI, authenticated (`gh auth status`).
//
// Field option IDs are resolved at runtime from `gh project field-list`, so
// this keeps working if the board's options are renamed or re-added. The
// board item id is resolved via `gh project item-add`, which is idempotent
// (returns the existing item for an issue already on the board) — so we never
// scan the 860+ item board (that hits GraphQL rate limits).
//
// CREATE (no --issue):
//   node driver.mjs --title "APP: Search modal calls FTS API query twice" \
//     [--body "..."] [--body-file path] [--label bug] [--label enhancement] \
//     [--status Ready] [--priority P2] [--size XS] [--complexity Medium] \
//     [--repo bccsa/luminary] [--dry-run]
//
// MODIFY (pass --issue <number|url>): only the flags you pass are changed.
//   node driver.mjs --issue 1712 --status "In progress" --priority P1
//   node driver.mjs --issue 1712 --title "APP: better title" \
//     --add-label enhancement --remove-label bug
//
// --status accepts any board column name (To triage, Backlog, Ready,
//   In progress, …). --column is an alias.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT_NUMBER = "4";
const OWNER = "bccsa";
const DEFAULT_REPO = "bccsa/luminary";

// ---- arg parsing -----------------------------------------------------------
const args = process.argv.slice(2);
const opts = { addLabels: [], removeLabels: [], repo: DEFAULT_REPO, dryRun: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  switch (a) {
    case "--issue": opts.issue = next(); break;
    case "--title": opts.title = next(); break;
    case "--body": opts.body = next(); break;
    case "--body-file": opts.body = readFileSync(next(), "utf8"); break;
    case "--label":
    case "--add-label": opts.addLabels.push(next()); break;
    case "--remove-label": opts.removeLabels.push(next()); break;
    case "--status":
    case "--column": opts.status = next(); break;
    case "--priority": opts.priority = next(); break;
    case "--size": opts.size = next(); break;
    case "--complexity": opts.complexity = next(); break;
    case "--repo": opts.repo = next(); break;
    case "--dry-run": opts.dryRun = true; break;
    case "-h":
    case "--help": opts.help = true; break;
    default: die(`unknown argument: ${a}`);
  }
}
if (opts.help) { console.log(helpText()); process.exit(0); }

const editing = opts.issue != null;
if (!editing && !opts.title) die("--title is required when creating (pass --issue to modify)");

function die(msg, { usage = true } = {}) {
  console.error(`error: ${msg}${usage ? `\n\n${helpText()}` : ""}`);
  process.exit(1);
}
function helpText() {
  return `log-ticket — create or modify a Luminary Development board ticket

CREATE (omit --issue):
  --title <str>        (required) folder-prefixed, e.g. "APP: <summary>", "Shared, APP: <summary>"
MODIFY (pass --issue):
  --issue <num|url>    existing issue to modify; only the flags you pass change

  --body <str>         issue body (markdown)
  --body-file <path>   read body from a file
  --label <name>       add a label (repeatable; alias --add-label)
  --remove-label <name> remove a label (repeatable; modify only)
  --status <name>      board column: To triage|Backlog|Ready|In progress|… (alias --column)
  --priority <name>    P0|P1|P2
  --size <name>        XS|S|M|L|XL
  --complexity <name>  Low|Medium|High
  --repo <owner/name>  default ${DEFAULT_REPO}
  --dry-run            print the plan, change nothing`;
}

// ---- gh helpers ------------------------------------------------------------
function gh(argv, { json = false } = {}) {
  let out;
  try {
    out = execFileSync("gh", argv, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    const detail = (e.stderr || e.message || "").trim();
    die(`\`gh ${argv.join(" ")}\` failed:\n  ${detail}`, { usage: false });
  }
  return json ? JSON.parse(out) : out.trim();
}

// ---- resolve project + field metadata --------------------------------------
const project = gh(["project", "view", PROJECT_NUMBER, "--owner", OWNER, "--format", "json"], { json: true });
const fieldList = gh(["project", "field-list", PROJECT_NUMBER, "--owner", OWNER, "--format", "json"], { json: true });

const fieldsByName = new Map();
for (const f of fieldList.fields) fieldsByName.set(f.name.toLowerCase(), f);

// map a requested single-select value to {fieldId, optionId}; exits on typo.
function resolveSelect(fieldName, value) {
  const field = fieldsByName.get(fieldName.toLowerCase());
  if (!field) die(`board has no field named "${fieldName}"`);
  const opt = (field.options || []).find((o) => o.name.toLowerCase() === value.toLowerCase());
  if (!opt) {
    const names = (field.options || []).map((o) => o.name).join(", ");
    die(`"${value}" is not a valid ${fieldName}. options: ${names}`);
  }
  return { fieldId: field.id, optionId: opt.id, label: `${fieldName}=${opt.name}` };
}

const selects = [];
if (opts.status) selects.push(resolveSelect("Status", opts.status));
if (opts.priority) selects.push(resolveSelect("Priority", opts.priority));
if (opts.size) selects.push(resolveSelect("Size", opts.size));
if (opts.complexity) selects.push(resolveSelect("Complexity", opts.complexity));

// issue URL: given verbatim if a URL, else built from repo + number.
function issueUrlFrom(ref) {
  return /^https?:\/\//.test(ref) ? ref : `https://github.com/${opts.repo}/issues/${ref}`;
}

// ---- dry run ---------------------------------------------------------------
if (opts.dryRun) {
  console.log(`DRY RUN — would ${editing ? "modify" : "create"}:`);
  if (editing) console.log(`  issue:  ${issueUrlFrom(opts.issue)}`);
  else console.log(`  repo:   ${opts.repo}`);
  if (opts.title != null) console.log(`  title:  ${opts.title}`);
  if (opts.body != null) console.log(`  body:   ${opts.body.split("\n")[0]}`);
  if (opts.addLabels.length) console.log(`  +labels: ${opts.addLabels.join(", ")}`);
  if (opts.removeLabels.length) console.log(`  -labels: ${opts.removeLabels.join(", ")}`);
  console.log(`  board:  ${project.title} (#${project.number})`);
  for (const s of selects) console.log(`  field:  ${s.label}`);
  process.exit(0);
}

// ---- create or edit the issue ----------------------------------------------
let issueUrl;
if (!editing) {
  const createArgs = ["issue", "create", "--repo", opts.repo, "--title", opts.title,
    "--body", opts.body || ""];
  for (const l of opts.addLabels) createArgs.push("--label", l);
  issueUrl = gh(createArgs);
  console.log(`created issue: ${issueUrl}`);
} else {
  issueUrl = issueUrlFrom(opts.issue);
  const editArgs = ["issue", "edit", issueUrl];
  let touched = false;
  if (opts.title != null) { editArgs.push("--title", opts.title); touched = true; }
  if (opts.body != null) { editArgs.push("--body", opts.body); touched = true; }
  for (const l of opts.addLabels) { editArgs.push("--add-label", l); touched = true; }
  for (const l of opts.removeLabels) { editArgs.push("--remove-label", l); touched = true; }
  if (touched) { gh(editArgs); console.log(`edited issue: ${issueUrl}`); }
}

// ---- set board fields ------------------------------------------------------
// Always add to the board when creating; when editing, only touch the board if
// the user asked to set a field. item-add is idempotent (returns the existing
// item for an issue already on the board), so it doubles as item-id lookup.
if (!editing || selects.length) {
  const item = gh(["project", "item-add", PROJECT_NUMBER, "--owner", OWNER, "--url", issueUrl,
    "--format", "json"], { json: true });
  if (!editing) console.log(`added to board: ${project.title}`);
  for (const s of selects) {
    gh(["project", "item-edit", "--project-id", project.id, "--id", item.id,
      "--field-id", s.fieldId, "--single-select-option-id", s.optionId]);
    console.log(`  set ${s.label}`);
  }
}

console.log(`\n✅ ${issueUrl}`);
