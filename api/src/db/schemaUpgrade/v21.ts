import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 20 to 21.
 *
 * Moves the legacy per-language `ContentDto.video` URL onto the parent's
 * `media.hlsUrl` (`_contentParentDto.media`, `MediaDto.hlsUrl`). The CMS video editor
 * (`EditContentVideo.vue`) already writes exclusively to `parent.media.hlsUrl`, and the
 * app already prefers `parentMedia.hlsUrl` over `content.video` (`videoSourceFor`) — so
 * `video` is dead weight on any Content doc whose parent already has an `hlsUrl`, and a
 * stale leftover on parents that don't.
 *
 * For each Post/Tag with no `media.hlsUrl`, the first non-empty `video` found among its
 * child Content docs (across languages) is copied onto `parent.media.hlsUrl` — the
 * per-parent `media` field can only hold one collection, so this is a many-to-one
 * collapse; any other distinct value among the remaining children is logged and
 * dropped. `video` is then deleted from every child that had it, regardless of whether
 * its value was the one kept, since a per-child video field is no longer read anywhere
 * once `parentMedia.hlsUrl` exists.
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

                const { docs: children } = await db.getContentByParentId(parent._id);
                const withVideo = (children as any[]).filter((c) => c.video);
                if (!withVideo.length) continue;

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
                }

                for (const child of withVideo) {
                    delete child.video;
                    child.updatedTimeUtc = Date.now();
                    await db.upsertDoc(child);
                    stats.childrenCleared++;
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
