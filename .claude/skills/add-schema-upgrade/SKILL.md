---
name: add-schema-upgrade
description: Generate a new database schema upgrade (vN.ts) — file boilerplate, wiring into db.upgrade.ts chain, README update, and seeding-doc sync. Use when the user asks to "add a schema upgrade", "bump the schema version", "migrate existing docs for X", or has changed a doc shape that needs backfilling on existing databases.
---

# add-schema-upgrade

Schema upgrades migrate existing CouchDB data on API startup. They are sequenced (`v9 → v10 → … → vN`), idempotent (no-op if the DB is already at or past their target), and **not run by tests** — seeding data must already match the latest schema.

## Background to read first

If you haven't already, read `api/src/db/schemaUpgrade/README.md`. It documents when to create / when not to / how to remove old upgrades. The current baseline at time of writing is **v15**.

## When to use this — and when not to

**Use this skill when:**
- Adding a required field to an existing doc type (existing docs need a backfill default).
- Renaming or changing the shape of an existing field.
- Backfilling derived data (e.g. v13 backfilled server-side FTS, v15 reconciled deleteCmd tracking).
- Forcing a re-sync of doc shape changes — bump `updatedTimeUtc` on affected docs and the next sync round delivers the new shape to all clients. (Per user feedback, this is the preferred strategy over client-side reshape migrations.)

**Do NOT use this for:**
- Adding an *optional* field — handle with code defaults.
- Adding a new doc type — existing data isn't affected.
- Changing views/indexes — that's design docs, handled by `upsertDesignDocs`.
- Config changes — env vars or settings docs.

## Procedure

### 1. Determine N+1

List the existing upgrades and identify the highest version:

```sh
ls /Users/dirk/projects/bccsa/luminary/api/src/db/schemaUpgrade/v*.ts
```

The next version is `N+1` where N is the highest existing. Read `api/src/db/db.upgrade.ts` to confirm the current chain — the highest `vN` imported there is authoritative.

### 2. Create `vN+1.ts`

Use `api/src/db/schemaUpgrade/v15.ts` as the template. Required structure:

```ts
import { DbService } from "../db.service";
// import any enums you need

/**
 * Upgrade the database schema from version <N> to <N+1>.
 *
 * <Brief description of what this migration does and why.>
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== <N>) {
            console.info(
                `Skipping schema upgrade v<N+1>: current version is ${schemaVersion}, expected <N>`,
            );
            return;
        }

        console.info(`Upgrading database schema from version ${schemaVersion} to <N+1>`);

        // Migration work here. Common patterns:
        //   - db.processAllDocs([DocType.X], async (doc) => { ... await db.insertDoc(doc); });
        //   - Bump updatedTimeUtc on affected docs to force re-sync to clients.

        await db.setSchemaVersion(<N+1>);
        console.info(`Database schema upgrade from version ${schemaVersion} to <N+1> completed successfully`);
    } catch (error) {
        console.error("Database schema upgrade to version <N+1> failed:", error);
        throw error;
    }
}
```

Rules:

- The `schemaVersion !== N` guard is **mandatory**. Without it, re-running on an already-upgraded DB corrupts data.
- The `setSchemaVersion(N+1)` call must be the **last** thing before the return. If the migration partially completes and throws, the version stays at N so the next startup retries from the same point.
- Wrap in `try/catch` and re-throw — the outer `upgradeDbSchema` needs the throw to halt API startup.
- For doc-shape changes that need to reach existing clients: instead of a complex client-side migration, just bump `updatedTimeUtc` on the affected docs (`await db.insertDoc(doc)` after reshaping). Per the user's stored preference, this is the canonical approach.

### 3. Wire into `db.upgrade.ts`

Edit `api/src/db/db.upgrade.ts`:

```ts
import vN1 from "./schemaUpgrade/vN+1";  // add the import alongside the existing ones

export async function upgradeDbSchema(db: DbService) {
    try {
        await v9(db);
        await v10(db);
        // ...
        await vN(db);
        await vN1(db);          // add at the end of the chain
    } catch (error) {
        console.error("Database schema upgrade failed:", error);
        throw error;
    }
}
```

Order matters — append at the end. The guard inside each upgrade makes them safely re-runnable, but the chain order is the source of truth for sequencing.

### 4. Update the README

Edit `api/src/db/schemaUpgrade/README.md`:

- Update the **Current Baseline** version line.
- Add an entry under **Current Upgrades** describing what `vN+1` does and why. Use the existing v13/v15 entries as the template — one short paragraph.

### 5. Update seeding docs (if doc shapes changed)

Tests do not run upgrades — they seed from `api/src/db/seedingDocs/*.json` and assume the seed data is in the latest schema. If `vN+1` adds a required field to an existing doc type:

```sh
ls /Users/dirk/projects/bccsa/luminary/api/src/db/seedingDocs/
```

For each seeding doc of the affected type, add the new field with a sensible default. Otherwise existing tests will fail with validation errors at startup.

### 6. Mirror DTO if needed

If `vN+1` adds or reshapes a field, the DTO must reflect it too — invoke `/sync-dtos` (or do the equivalent: edit `api/src/dto/<Name>Dto.ts` and `shared/src/types/dto.ts`).

### 7. Test (locally, not e2e)

Run `npm run test` in `api/` — confirms the seeding docs validate and existing tests still pass. Do NOT run e2e/playwright — user-driven.

For the upgrade itself: there is `api/src/db/db.upgrade.spec.ts`. Add a test there if the migration logic is non-trivial. Mirror the pattern of existing tests.

### 8. Report

- File created: `api/src/db/schemaUpgrade/vN+1.ts`
- Wired in: `api/src/db/db.upgrade.ts` (import + chain entry)
- README updated: baseline bumped + new entry added
- Seeding docs: list of files updated (or "none needed")
- DTOs mirrored: yes/no
- Tests: pass / failed (with details)

## What this skill is NOT

- Not a code reviewer. Don't pass judgement on the migration logic itself — the user owns the data transformation.
- Not a production deploy gate. Bumping the baseline + removing old upgrades is a separate process documented in `schemaUpgrade/README.md` ("When to Remove Old Schema Upgrades").
- Not for design-doc changes. Those are not schema upgrades.
