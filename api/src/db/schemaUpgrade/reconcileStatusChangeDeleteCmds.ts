import { DbService } from "../db.service";
import { DeleteReason, DocType, PublishStatus } from "../../enums";

/**
 * Reconciles `StatusChange` deleteCmd documents with their target Content documents:
 *
 *   - Deletes orphan `StatusChange` deleteCmds whose target content is Published
 *     (republished without the deleteCmd being cleaned up) or has been hard-deleted.
 *   - Backfills `statusChangeDeleteCmdId` on Draft content docs so the republish path
 *     can delete the deleteCmd by primary key.
 *   - Deletes duplicate `StatusChange` deleteCmds for the same content doc: the content
 *     tracks one ID, so any extras are stale.
 *
 * A point-in-time reconciliation, safe to run more than once.
 */
export async function reconcileStatusChangeDeleteCmds(db: DbService): Promise<void> {
    let deletedOrphans = 0;
    let backfilled = 0;
    let alreadyTracked = 0;
    // Per content doc: the deleteCmd `_id` kept or backfilled so far.
    const trackedByContentId = new Map<string, string>();

    await db.processAllDocs([DocType.DeleteCmd], async (cmd: any) => {
        if (!cmd || cmd.deleteReason !== DeleteReason.StatusChange) return;

        const contentRes = await db.getDoc(cmd.docId);
        const content = contentRes.docs[0];

        if (!content || content.status === PublishStatus.Published) {
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
            await db.deleteDoc(cmd._id);
            deletedOrphans++;
            return;
        }

        content.statusChangeDeleteCmdId = cmd._id;
        await db.insertDoc(content);
        trackedByContentId.set(content._id, cmd._id);
        backfilled++;
    });

    console.info(
        `StatusChange deleteCmd reconciliation: ${deletedOrphans} orphan(s) deleted, ${backfilled} backfilled on draft docs, ${alreadyTracked} already-tracked`,
    );
}
