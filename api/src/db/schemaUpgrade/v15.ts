import { DbService } from "../db.service";
import { DeleteReason, DocType, PublishStatus } from "../../enums";

/**
 * Upgrade the database schema from version 14 to 15.
 *
 * Reconciles `StatusChange` deleteCmd documents with their target Content documents:
 *
 *   - Deletes orphan `StatusChange` deleteCmds whose target content is Published
 *     (republished without the deleteCmd ever being cleaned up) or whose target
 *     content has been hard-deleted.
 *   - Backfills `statusChangeDeleteCmdId` on Draft content docs so the runtime
 *     republish path can delete the deleteCmd by primary key (no Mango fallback needed).
 *   - Deletes duplicate `StatusChange` deleteCmds for the same content doc — the
 *     content tracks one ID; any extras are stale leaks.
 *
 * Caveat: this is a point-in-time reconciliation. A rare `insertDoc` conflict-retry
 * race at runtime (concurrent unpublish + republish on the same content) can still
 * create new orphans because the surrounding `upsertDoc` decision is made against
 * the pre-conflict `existing` snapshot. The client-side timestamp guard in
 * `shared/src/db/database.ts` prevents user-visible harm if that happens.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        // Accept 13 or 14 — v14 is reserved by a parallel branch. Once that lands and bumps
        // the schema to 14, v15 will pick up from there; until then v15 runs straight after v13.
        if (schemaVersion !== 13 && schemaVersion !== 14) {
            console.info(
                `Skipping schema upgrade v15: current version is ${schemaVersion}, expected 13 or 14`,
            );
            return;
        }

        console.info(`Upgrading database schema from version ${schemaVersion} to 15`);

        let deletedOrphans = 0;
        let backfilled = 0;
        let alreadyTracked = 0;
        // Per content doc: the deleteCmd `_id` we have already kept/backfilled.
        const trackedByContentId = new Map<string, string>();

        await db.processAllDocs([DocType.DeleteCmd], async (cmd: any) => {
            if (!cmd || cmd.deleteReason !== DeleteReason.StatusChange) return;

            const contentRes = await db.getDoc(cmd.docId);
            const content = contentRes.docs[0];

            // Target content is gone (hard-deleted) — the StatusChange cmd is orphaned.
            if (!content) {
                await db.deleteDoc(cmd._id);
                deletedOrphans++;
                return;
            }

            // Target content is Published — the cmd was never cleaned up on republish.
            if (content.status === PublishStatus.Published) {
                await db.deleteDoc(cmd._id);
                deletedOrphans++;
                return;
            }

            // Target content is Draft: keep exactly one deleteCmd per content doc.
            const trackedOnContent: string | undefined = content.statusChangeDeleteCmdId;
            const trackedThisRun = trackedByContentId.get(content._id);

            if (trackedOnContent === cmd._id || trackedThisRun === cmd._id) {
                alreadyTracked++;
                trackedByContentId.set(content._id, cmd._id);
                return;
            }

            if (trackedOnContent || trackedThisRun) {
                // Content already tracks a different deleteCmd. This one is a duplicate.
                await db.deleteDoc(cmd._id);
                deletedOrphans++;
                return;
            }

            // Content has no tracking field yet — backfill it.
            content.statusChangeDeleteCmdId = cmd._id;
            await db.insertDoc(content);
            trackedByContentId.set(content._id, cmd._id);
            backfilled++;
        });

        console.info(
            `StatusChange deleteCmd reconciliation: ${deletedOrphans} orphan(s) deleted, ${backfilled} backfilled on draft docs, ${alreadyTracked} already-tracked`,
        );

        await db.setSchemaVersion(15);
        console.info(`Database schema upgrade from version ${schemaVersion} to 15 completed successfully`);
    } catch (error) {
        console.error("Database schema upgrade to version 15 failed:", error);
        throw error;
    }
}
