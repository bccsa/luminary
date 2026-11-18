import { DbService } from "../db.service";
import { reconcileStatusChangeDeleteCmds } from "./reconcileStatusChangeDeleteCmds";

/**
 * Upgrade the database schema from version 14 to 15.
 *
 * Reconciles `StatusChange` deleteCmd documents with their target Content documents
 * (see {@link reconcileStatusChangeDeleteCmds}).
 *
 * Caveat: this is a point-in-time reconciliation. A rare `insertDoc` conflict-retry
 * race at runtime (concurrent unpublish + republish on the same content) can still
 * create new orphans because the surrounding `upsertDoc` decision is made against
 * the pre-conflict `existing` snapshot. The client-side timestamp guard in
 * `shared/src/db/database.ts` prevents user-visible harm if that happens.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        // Accept 13 or 14 — v14 is reserved by a parallel branch. Once that lands and bumps
        // the schema to 14, v15 will pick up from there; until then v15 runs straight after v13.
        if (schemaVersion !== 13 && schemaVersion !== 14) {
            console.info(
                `Skipping schema upgrade v15: current version is ${schemaVersion}, expected 13 or 14`,
            );
            return;
        }

        console.info(`Upgrading database schema from version ${schemaVersion} to 15`);

        await reconcileStatusChangeDeleteCmds(db);

        await db.setSchemaVersion(15);
        console.info(
            `Database schema upgrade from version ${schemaVersion} to 15 completed successfully`,
        );
    } catch (error) {
        console.error("Database schema upgrade to version 15 failed:", error);
        throw error;
    }
}
