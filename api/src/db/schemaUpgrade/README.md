# Database Schema Upgrades

## Overview

This directory contains database schema upgrade scripts that migrate existing CouchDB data from one schema version to another. Each upgrade file handles the migration from version N to N+1.

## How Schema Upgrades Work

### Schema Version Tracking

-   Schema version is stored in a CouchDB document with `_id: "_schemas"` containing a `schemaVersion` field
-   The version starts at 0 (when the document doesn't exist) and increments with each upgrade
-   Accessed via `DbService.getSchemaVersion()` and `DbService.setSchemaVersion()`

### Execution Flow

Schema upgrades are executed during API startup (in `main.ts`):

1. Design documents are inserted/updated (CouchDB views and indexes)
2. Database seeding (only if `npm run seed` is run)
3. Permission system initialization
4. S3 change listener initialization
5. **Schema upgrades run sequentially** (only executes upgrades newer than current version)
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

**Current Schema Version**: 10 (as of 2026-02-06)

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
