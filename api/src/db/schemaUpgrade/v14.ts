import { DbService } from "../db.service";
import { DocType } from "../../enums";

export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 13) {
            console.info("Upgrading database schema from version 13 to 14");

            let contentUpdated = 0;
            let languagesUpdated = 0;
            let languagesWithoutSpeed = 0;

            const readingSpeeds = new Map<string, number>();

            await db.processAllDocs([DocType.Language], async (doc: any) => {
                if (!doc) return;
                if (!doc.averageReadingSpeed) {
                    doc.averageReadingSpeed = 200;
                    await db.insertDoc(doc);
                    languagesWithoutSpeed++;
                }
                readingSpeeds.set(doc._id, doc.averageReadingSpeed);
                languagesUpdated++;
            });

            console.info(
                `Schema v14 update complete: ${contentUpdated} contents, ${languagesUpdated} languages (${languagesWithoutSpeed} with default speed) have been updated.`,
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
