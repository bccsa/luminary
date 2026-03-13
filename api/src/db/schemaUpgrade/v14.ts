import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 13 to 14.
 * Backfill memberOf on AuthProvider documents from groupMappings so sync queries return them.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 13) {
            console.info("Upgrading database schema from version 13 to 14");

            let updatedCount = 0;

            await db.processAllDocs([DocType.AuthProvider], async (doc: any) => {
                if (!doc || !Array.isArray(doc.groupMappings) || doc.groupMappings.length === 0)
                    return;

                const memberOfFromMappings = doc.groupMappings.map((m: { groupId: string }) => m.groupId);
                const existingMemberOf = Array.isArray(doc.memberOf) ? doc.memberOf : [];

                if (
                    existingMemberOf.length === 0 ||
                    existingMemberOf.length !== memberOfFromMappings.length ||
                    memberOfFromMappings.some((g: string) => !existingMemberOf.includes(g))
                ) {
                    doc.memberOf = memberOfFromMappings;
                    await db.insertDoc(doc);
                    updatedCount++;
                }
            });

            console.info(
                `AuthProvider memberOf backfill complete: ${updatedCount} document(s) updated`,
            );

            await db.setSchemaVersion(14);
            console.info("Database schema upgrade from version 13 to 14 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v14: current version is ${schemaVersion}, expected 13`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 13 to 14 failed:", error);
        throw error;
    }
}
