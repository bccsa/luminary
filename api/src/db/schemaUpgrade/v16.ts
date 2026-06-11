import { DbService } from "../db.service";
import { DocType, PublishStatus } from "../../enums";
import { ContentDto } from "../../dto/ContentDto";

/**
 * Upgrade the database schema from version 15 to 16.
 *
 * One-time enforcement of the slug invariant — per slug, published Content and a
 * Redirect are mutually exclusive (the redirect wins). For every Redirect, any
 * *published* Content doc sharing its slug is forced to Draft. Going forward the
 * invariant is held by the change-request pipeline (`processContentDto` blocks
 * publishing over a redirect; `validateChangeRequest` rejects a redirect over
 * published content); this backfills pre-existing collisions.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 15) {
            console.info(
                `Skipping schema upgrade v16: current version is ${schemaVersion}, expected 15`,
            );
            return;
        }

        console.info(`Upgrading database schema from version ${schemaVersion} to 16`);

        let unpublished = 0;

        await db.processAllDocs([DocType.Redirect], async (redirect: any) => {
            if (!redirect?.slug) return;
            const colliding = (await db.getDocsBySlug(
                redirect.slug,
                DocType.Content,
            )) as ContentDto[];
            for (const content of colliding) {
                if (content.status !== PublishStatus.Published) continue;
                content.status = PublishStatus.Draft;
                content.updatedTimeUtc = Date.now();
                await db.insertDoc(content);
                unpublished++;
            }
        });

        console.info(
            `Slug-invariant cleanup: ${unpublished} content doc(s) unpublished due to a redirect slug collision.`,
        );

        await db.setSchemaVersion(16);
        console.info(
            `Database schema upgrade from version ${schemaVersion} to 16 completed successfully`,
        );
    } catch (error) {
        console.error("Database schema upgrade to version 16 failed:", error);
        throw error;
    }
}
