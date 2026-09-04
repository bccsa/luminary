import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { ContentDto } from "../../dto/ContentDto";

/**
 * Upgrade the database schema from version 20 to 21: the legacy per-language
 * `ContentDto.video` URL moves onto the parent's `media.hlsUrl`.
 *
 * A parent holds one collection, so the first child's value wins and any other
 * distinct value is logged and dropped. `video` is then cleared from every child,
 * and `parentMedia` stamped on them as a change request would.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 20) {
            console.info(
                `Skipping schema upgrade v21: current version is ${schemaVersion}, expected 20`,
            );
            return;
        }

        console.info(`Upgrading database schema from version ${schemaVersion} to 21`);

        const stats = {
            parentsScanned: 0,
            parentsUpdated: 0,
            childrenCleared: 0,
            valuesDropped: 0,
        };

        for (const docType of [DocType.Post, DocType.Tag]) {
            const { docs: parents } = await db.getDocsByType(docType);

            for (const parent of parents) {
                stats.parentsScanned++;

                const { docs } = await db.getContentByParentId(parent._id);
                const children = docs as ContentDto[];
                const withVideo = children.filter((c) => c.video);
                if (!withVideo.length) continue;

                let parentUpdated = false;
                if (!parent.media?.hlsUrl) {
                    if (!parent.media) parent.media = { fileCollections: [] };
                    parent.media.hlsUrl = withVideo[0].video;

                    const distinctValues = new Set(withVideo.map((c) => c.video));
                    if (distinctValues.size > 1) {
                        stats.valuesDropped += distinctValues.size - 1;
                        console.warn(
                            `Parent ${parent._id} had ${distinctValues.size} distinct legacy video URLs across its content languages; kept "${withVideo[0].video}" on media.hlsUrl, dropped the rest.`,
                        );
                    }

                    parent.updatedTimeUtc = Date.now();
                    await db.upsertDoc(parent);
                    stats.parentsUpdated++;
                    parentUpdated = true;
                }

                // `parentMedia` is only ever stamped by a change request, so a migrated
                // parent's children must get it here or the app shows no video until
                // the parent is next saved.
                for (const child of children) {
                    const hadVideo = Boolean(child.video);
                    if (!hadVideo && !parentUpdated) continue;

                    delete child.video;
                    if (parentUpdated) {
                        child.parentMedia = parent.media;
                        child.parentMediaBucketId = parent.mediaBucketId;
                    }
                    child.updatedTimeUtc = Date.now();
                    await db.upsertDoc(child);
                    if (hadVideo) stats.childrenCleared++;
                }
            }
        }

        console.info(
            `Video-field migration: scanned ${stats.parentsScanned} parent(s); moved a value onto ${stats.parentsUpdated} parent(s)' media.hlsUrl; cleared the legacy video field on ${stats.childrenCleared} content doc(s); ${stats.valuesDropped} distinct value(s) dropped (a parent can only hold one hlsUrl).`,
        );

        await db.setSchemaVersion(21);
        console.info(
            `Database schema upgrade from version ${schemaVersion} to 21 completed successfully`,
        );
    } catch (error) {
        console.error("Database schema upgrade to version 21 failed:", error);
        throw error;
    }
}
