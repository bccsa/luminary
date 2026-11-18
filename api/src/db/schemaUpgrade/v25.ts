import { DbService } from "../db.service";
import { reconcileStatusChangeDeleteCmds } from "./reconcileStatusChangeDeleteCmds";

/**
 * Upgrade the database schema from version 24 to 25.
 *
 * Saving a draft again dropped its `statusChangeDeleteCmdId`, so republishing it left the
 * `StatusChange` deleteCmd behind. Those deleteCmds keep naming live content, and anything
 * that acts on their slug (the static site build) deletes the live page. Re-runs the
 * reconciliation (see {@link reconcileStatusChangeDeleteCmds}) to delete them and to
 * re-link the deleteCmds of drafts that lost their tracking field.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 24) {
            console.info(
                `Skipping schema upgrade v25: current version is ${schemaVersion}, expected 24`,
            );
            return;
        }

        console.info("Upgrading database schema from version 24 to 25");

        await reconcileStatusChangeDeleteCmds(db);

        await db.setSchemaVersion(25);
        console.info("Database schema upgrade from version 24 to 25 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade to version 25 failed:", error);
        throw error;
    }
}
