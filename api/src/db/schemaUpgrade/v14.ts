import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { computeFtsData } from "../../util/ftsIndexing";

export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 13) {
            console.info("Upgrading database schema from version 13 to 14");

            let contentUpdated = 0;
            let languagesUpdated = 0;
            let languagesWithoutSpeed = 0;
            let contentsWithoutLanguage = 0;

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

            await db.processAllDocs([DocType.Content], async (doc: any) => {
                if (!doc) return;

                const newWordCount = computeFtsData(doc).wordCount;

                if (!readingSpeeds.has(doc.language)) {
                    contentsWithoutLanguage++;
                    console.warn(`Content ${doc._id} references missing language: ${doc.language}`);
                }

                const speed = readingSpeeds.get(doc.language) || 200;
                const newReadingTime = Math.ceil(newWordCount / speed);

                if (doc.wordCount !== newWordCount || doc.readingTime !== newReadingTime) {
                    doc.wordCount = newWordCount;
                    doc.readingTime = newReadingTime;
                    await db.insertDoc(doc);
                    contentUpdated++;
                }
            });

            console.info(
                `Schema v14 update complete: ${contentUpdated} contents, ${languagesUpdated} languages (${languagesWithoutSpeed} with default speed) and ${contentsWithoutLanguage} contents with missing language have been updated.`,
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
