import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { toStoredMediaUrl } from "../../changeRequests/documentProcessing/mediaUrl";

/** The configured bucket a URL lives in, if any — the same match processMedia uses. */
function bucketFor(url: string, buckets: any[]): any | undefined {
    return buckets.find((b) => b.publicUrl && toStoredMediaUrl(url, b.publicUrl) !== url);
}

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
            bucketsNamed: 0,
            childrenCleared: 0,
            valuesDropped: 0,
        };

        // A URL inside one of our buckets must name that bucket, or the next save
        // is refused ("Bucket is not specified") with no way to pick one when a
        // single bucket exists.
        const { docs: buckets } = await db.getDocsByType(DocType.Storage);

        for (const docType of [DocType.Post, DocType.Tag]) {
            const { docs: parents } = await db.getDocsByType(docType);

            for (const parent of parents) {
                stats.parentsScanned++;

                const { docs: children } = await db.getContentByParentId(parent._id);
                const withVideo = (children as any[]).filter((c) => c.video);
                if (!withVideo.length) continue;

                let parentChanged = false;
                if (!parent.media?.hlsUrl) {
                    if (!parent.media) parent.media = { fileCollections: [] };
                    parent.media.hlsUrl = withVideo[0].video;
                    parentChanged = true;

                    const distinctValues = new Set(withVideo.map((c) => c.video));
                    if (distinctValues.size > 1) {
                        stats.valuesDropped += distinctValues.size - 1;
                        console.warn(
                            `Parent ${parent._id} had ${distinctValues.size} distinct legacy video URLs across its content languages; kept "${withVideo[0].video}" on media.hlsUrl, dropped the rest.`,
                        );
                    }
                }

                if (!parent.mediaBucketId) {
                    const bucket = bucketFor(parent.media.hlsUrl, buckets as any[]);
                    if (bucket) {
                        parent.mediaBucketId = bucket._id;
                        parentChanged = true;
                        stats.bucketsNamed++;
                    }
                }

                if (parentChanged) {
                    parent.updatedTimeUtc = Date.now();
                    await db.upsertDoc(parent);
                    stats.parentsUpdated++;
                }

                // Every translation, not only those that carried a video: the app
                // reads the parent's media through the child's mirror, and only a
                // parent save would otherwise re-stamp it — until then the video is
                // gone from the app.
                for (const child of children as any[]) {
                    const hadVideo = Boolean(child.video);
                    delete child.video;
                    child.parentMedia = parent.media;
                    child.parentMediaBucketId = parent.mediaBucketId;
                    child.updatedTimeUtc = Date.now();
                    await db.upsertDoc(child);
                    if (hadVideo) stats.childrenCleared++;
                }
            }
        }

        console.info(
            `Video-field migration: scanned ${stats.parentsScanned} parent(s); updated ${stats.parentsUpdated} parent(s) (${stats.bucketsNamed} given their bucket); cleared the legacy video field on ${stats.childrenCleared} content doc(s); ${stats.valuesDropped} distinct value(s) dropped (a parent can only hold one hlsUrl).`,
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
