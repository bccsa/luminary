# Database Schema Upgrades

## Overview

This directory contains database schema upgrade scripts that migrate existing CouchDB data from one schema version to another. Each upgrade file handles the migration from version N to N+1.

## How Schema Upgrades Work

### Schema Version Tracking

-   Schema version is stored in a CouchDB document with `_id: "dbSchema"` containing a `version` field
-   The version reads as `0` when the document doesn't exist (a fresh database) and increments with each upgrade
-   Accessed via `DbService.getSchemaVersion()` and `DbService.setSchemaVersion()`

### Fresh-database initializer (`initSchemaVersion`)

Every versioned upgrade (`v9`..`vN`) guards on an *exact* prior version (e.g. `v18` only runs when the version is exactly `17`). On a brand-new database the version reads as `0`, so **none** of them run and the `dbSchema` document would never be created — leaving the version permanently unset.

To prevent this, `initSchemaVersion` runs **first** in the chain (before `v9`). When the version is `0` it stamps the `dbSchema` document at `FRESH_DB_SCHEMA_VERSION` (defined in `freshDbSchemaVersion.ts`). It is a strict **no-op** on any database that already has a `dbSchema` document, so existing and mid-upgrade databases are never touched.

`FRESH_DB_SCHEMA_VERSION` is set to **one below** the newest FTS-backfill upgrade (`17`, i.e. one below `v18`) rather than the absolute latest. Seeding writes raw JSON and bypasses `processUserDto`/`processRedirectDto`, so freshly-seeded User/Redirect docs have no `fts` field. Stamping at `17` lets the chain still run `v18` over the seeded docs, computing their `fts` so the strict server-side `/fts` search can find them. (`v18` only touches the DB — unlike `v17`, which needs S3 — so it is safe to run on a fresh DB.)

> When you add a new upgrade, set `FRESH_DB_SCHEMA_VERSION` to the version just below the newest upgrade that must run over seeded data, and confirm that upgrade is safe to execute against a fresh database.
>
> **Note:** seeded **Content** docs still have no `fts` (the `v13` content backfill is not re-run on a fresh DB, since stamping that low would also drag in `v16`/`v17` side effects). Content created through the change-request pipeline gets `fts` at write time; only seed sample Content is unindexed.

### Execution Flow

Schema upgrades are executed during API startup (in `main.ts`):

1. Design documents are inserted/updated (CouchDB views and indexes)
2. Database seeding (only if `npm run seed` is run)
3. Permission system initialization
4. S3 change listener initialization
5. **Schema upgrades run sequentially** — `initSchemaVersion` first (stamps a fresh DB at the latest version), then each versioned upgrade newer than the current version
6. API starts serving requests

### Upgrade Function Structure

Each upgrade file should export a default async function that:

1. Checks the current schema version
2. Only executes if the database is at the expected version
3. Performs data transformations
4. Updates the schema version on success

Example structure:

```typescript
import { DbService } from "../db.service";

export default async function upgrade(db: DbService): Promise<void> {
    const currentVersion = await db.getSchemaVersion();

    if (currentVersion !== 9) {
        return; // Already upgraded or wrong version
    }

    // Perform migration logic here
    // Example: Update documents, add new fields, transform data

    await db.setSchemaVersion(10);
    console.log("Database schema upgraded to version 10");
}
```

## When to Create a Schema Upgrade

Create a new schema upgrade when:

-   **Adding new required fields** to existing document types
-   **Changing field types or structures** (e.g., string → object, boolean → number)
-   **Renaming fields** that contain important data
-   **Migrating data** from one format to another
-   **Adding relationships** between documents that need to be established for existing data
-   **Removing fields** that are no longer used (optional but good for cleanup)

## When NOT to Create a Schema Upgrade

Don't create an upgrade for:

-   **Adding optional fields** - new optional fields can be handled by code defaults
-   **Adding new document types** - these don't affect existing data
-   **Changes to views/indexes** - these are handled by design documents
-   **Configuration changes** - these are handled by environment variables or settings documents

## Creating a New Schema Upgrade

1. **Create the upgrade file**: `schemaUpgrade/v{N}.ts` where N is the next version number
2. **Import in db.upgrade.ts**:
    ```typescript
    import v10 from "./schemaUpgrade/v10";
    ```
3. **Add to upgrade function**:
    ```typescript
    export async function upgradeDbSchema(db: DbService) {
        try {
            await v10(db);
            // Future upgrades...
        } catch (error) {
            console.error("Database schema upgrade failed:", error);
            throw error;
        }
    }
    ```
4. **Test thoroughly** before deploying to production
5. **Document the changes** in this README or in comments

## When to Remove Old Schema Upgrades

Schema upgrades can be safely removed when:

1. **All production databases are at the latest version** - Verify by checking the `_schemas` document in each production CouchDB instance
2. **No rollback is planned** - Once removed, you cannot downgrade database versions
3. **All staging/development environments are updated** - Ensure no environments need the old upgrade path

### Removal Process

1. **Verify all databases are current**:
    ```bash
    # Check production database schema version
    curl http://admin:password@localhost:5984/database/_schemas
    ```
2. **Archive old upgrades** (optional but recommended):
    - Move old upgrade files to `docs/historical-upgrades/` for reference
    - Include git commit hash and date when they were removed
3. **Remove from codebase**:
    - Delete old upgrade files
    - Remove imports from `db.upgrade.ts`
    - Update this README with the new baseline version
4. **Update seeding data** - Ensure `api/src/db/seedingDocs/` JSON files match current schema
5. **Test new installations** - Verify fresh databases work correctly without old upgrades

### Current Baseline


**Current Schema Version**: 18 (as of 2026-06-22)

All production databases are expected to be at version 10 or higher. Historical upgrades v1-v9 have been removed as they are no longer needed.

## Testing Considerations

**Important**: Tests do NOT use schema upgrades!

-   The test module (`api/src/test/testingModule.ts`) creates fresh databases with current seeding data
-   Seeding data is already in the latest schema format
-   Tests start at the current schema version, not version 0
-   This means removing old upgrades will not break tests

## Historical Upgrades (Removed)

### v1-v9 (Removed 2026-02-03)

Historical schema upgrades that migrated data from the initial schema to version 9. These included:

-   Field renames and restructuring
-   Image migration to S3
-   Tag caching system
-   Multi-bucket storage architecture
-   Various field additions and type changes

These upgrades were removed after confirming all production databases were at version 9 or higher.

## Current Upgrades

### v13 — FTS backfill (2026-03-09)

Backfills pre-calculated FTS (full-text search) index data on all Content documents. Previously FTS indexing was done client-side; it is now computed server-side and delivered as `fts` and `ftsTokenCount` fields on ContentDto. See ADR 0009 for details.

### v16 — Slug invariant cleanup (2026-06-08)

Enforces the slug invariant — per slug, published Content and a Redirect are mutually exclusive (the redirect wins). For every Redirect, any _published_ Content doc sharing its slug is forced to Draft. Going forward the invariant is held by the change-request pipeline (`processContentDto` blocks publishing over a redirect; `validateChangeRequest` rejects a redirect over published content); this backfills pre-existing collisions.

### v17 — ThumbHash backfill (2026-06-18)

Backfills ThumbHash placeholders (`ImageFileCollectionDto.thumbHash`, a ~25-byte base64 blurred preview) for pre-existing images. ThumbHash is only generated at image-upload time, so older images lack it. For each Post/Tag whose image collections are missing a ThumbHash, it fetches the smallest stored variant from that doc's bucket (S3), encodes the hash, re-saves the parent, and re-denormalises `imageData` onto child Content docs' `parentImageData`. Each save bumps `updatedTimeUtc` so clients re-sync and show blurs for old content. Per-image fetch/encode failures are logged and skipped (a missing S3 object must not block startup); a DB-level failure re-throws so the version stays put and the next startup retries (the per-collection `thumbHash` skip makes that idempotent).

### v18 — User/Redirect FTS backfill (2026-06-22)

Backfills the server-authoritative `fts` trigram index on existing User (name + email) and Redirect (slug + toSlug) documents so the strict server-side `/fts` search can find them without a full table scan. Mirrors the Content backfill (v13) but uses the per-doctype field configs and writes no `ftsTokenCount` (these doctypes use strict substring search, not BM25). Uses `insertDoc` to preserve `updatedTimeUtc` — `fts` is a server-only index field that must not churn already-synced clients. Docs with no indexable text are skipped (they remain listable via browse, just not searchable). Also requires the new `fts-trigram-index-user` / `fts-trigram-index-redirect` CouchDB views (seeded as design docs); those build on first access after deploy.
