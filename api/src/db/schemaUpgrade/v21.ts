import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { ContentDto } from "../../dto/ContentDto";

/**
 * Upgrade the database schema from version 20 to 21: the legacy per-language
 * `ContentDto.video` URL moves onto the parent's `media.hlsUrl`.
 *
 * A parent holds one collection, so the first child's value wins and any other
 * distinct value is logged and dropped. `parentMedia` is stamped on every child as
 * a change request would, and `video` is copied rather than moved: it stays on the
 * children for app builds that still read it (ADR 0005).
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
            childrenStamped: 0,
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

                if (!parentUpdated) continue;

                // `parentMedia` is only ever stamped by a change request, so a migrated
                // parent's children must get it here or the app shows no video until
                // the parent is next saved.
                //
                // `video` stays where it is. App builds from before the field moved
                // gate the player on it, and ADR 0005 is written for installs that
                // update rarely: taking it away costs them a video they play today,
                // while a newer build prefers `parentMedia.hlsUrl` and ignores it.
                for (const child of children) {
                    child.parentMedia = parent.media;
                    child.parentMediaBucketId = parent.mediaBucketId;
                    child.updatedTimeUtc = Date.now();
                    await db.upsertDoc(child);
                    stats.childrenStamped++;
                }
            }
        }

        console.info(
            `Video-field migration: scanned ${stats.parentsScanned} parent(s); moved a value onto ${stats.parentsUpdated} parent(s)' media.hlsUrl; stamped parentMedia on ${stats.childrenStamped} content doc(s); ${stats.valuesDropped} distinct value(s) dropped (a parent can only hold one hlsUrl). The legacy video field is left in place for app builds that still read it.`,
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
