import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { ContentDto } from "src/dto/ContentDto";

/**
 * Upgrade the database schema from version 6 to 7
 * Update parentAvailableTranslations field to have all available translations for a parent
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 6) {
        console.info("Upgrading database schema from version 6 to 7");

        await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
            if (doc) {
                const allContentForParent = (await db.getContentByParentId(doc._id))
                    .docs as ContentDto[];
                allContentForParent.forEach((c) => {
                    c.availableTranslations = allContentForParent.map((doc) => doc.language);
                    db.upsertDoc(c);
                });
            }
        });

        await db.setSchemaVersion(7);
        console.info("Database schema upgrade from version 6 to 7 completed");
    }
}
