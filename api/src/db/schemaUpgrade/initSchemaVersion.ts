import { DbService } from "../db.service";
import { FRESH_DB_SCHEMA_VERSION } from "./freshDbSchemaVersion";

/**
 * Default startup schema initializer. Runs first, before the versioned upgrade chain.
 *
 * On a brand-new database the `dbSchema` document does not exist, so `getSchemaVersion()` returns
 * 0. Every versioned upgrade (`v9`..`vN`) guards on an exact prior version (e.g. v18 only runs when
 * the version is exactly 17), so on a fresh database none of them run and the `dbSchema` document is
 * never created — the version stays permanently unset at 0.
 *
 * This script stamps a fresh database at {@link FRESH_DB_SCHEMA_VERSION} — intentionally one below
 * the newest FTS backfill — so the version is tracked AND the chain still runs that backfill over
 * the freshly-seeded docs (see `freshDbSchemaVersion.ts` for the rationale).
 *
 * It is a strict no-op on any database that already has a `dbSchema` document (version > 0), so
 * existing and mid-upgrade databases are never touched.
 */
export default async function (db: DbService) {
    try {
        const currentVersion = await db.getSchemaVersion();

        // version 0 means the `dbSchema` doc is missing (see DbService.getSchemaVersion) — i.e. a
        // fresh database. Any value > 0 means the chain owns it; leave it alone.
        if (currentVersion === 0) {
            await db.setSchemaVersion(FRESH_DB_SCHEMA_VERSION);
            console.info(
                `Initialized database schema version to ${FRESH_DB_SCHEMA_VERSION} (fresh database)`,
            );
        }
    } catch (error) {
        console.error("Database schema initialization failed:", error);
        throw error;
    }
}
