import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 13 to 14.
 *
 * For each User doc that has `oAuthProviderId` and `userId` but no `providerIdentifiers`:
 * - Sets `providerIdentifiers: [{ providerId: doc.oAuthProviderId, userId: doc.userId }]`
 * - Sets `providers: [doc.oAuthProviderId]`
 *
 * The legacy `oAuthProviderId` and `userId` fields are kept intact so existing code
 * paths continue to work until identity resolution is fully switched over.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 13) {
            console.info(`Skipping schema upgrade v14: current version is ${schemaVersion}, expected 13`);
            return;
        }

        console.info("Upgrading database schema from version 13 to 14");

        // Fetch all User documents
        const result = await db.executeFindQuery({
            selector: { type: DocType.User },
            limit: 10000,
        });

        const userDocs = (result.docs ?? []) as Array<Record<string, unknown>>;
        let migratedCount = 0;

        for (const doc of userDocs) {
            const oAuthProviderId = doc["oAuthProviderId"] as string | undefined;
            const userId = doc["userId"] as string | undefined;

            // Only migrate docs that have the legacy compound key but not the new structure
            if (oAuthProviderId && userId && !doc["providerIdentifiers"]) {
                const updated = {
                    ...doc,
                    providers: [oAuthProviderId],
                    providerIdentifiers: [{ providerId: oAuthProviderId, userId }],
                };
                await db.upsertDoc(updated as any);
                migratedCount++;
            }
        }

        console.info(`Migrated ${migratedCount} user doc(s) to providerIdentifiers/providers`);

        await db.setSchemaVersion(14);
        console.info("Database schema upgrade from version 13 to 14 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 13 to 14 failed:", error);
        throw error;
    }
}
