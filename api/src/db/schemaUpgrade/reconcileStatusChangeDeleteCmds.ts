import { DbService } from "../db.service";
import { DeleteReason, DocType, PublishStatus } from "../../enums";

type StatusChangeCmd = { _id: string; updatedTimeUtc: number };

/**
 * Reconciles `StatusChange` deleteCmd documents with their target Content documents:
 *
 *   - Deletes the `StatusChange` deleteCmds of content that is Published (republished
 *     without the deleteCmd being cleaned up) or has been hard-deleted.
 *   - Keeps one deleteCmd per Draft content doc, the newest, and deletes the others: the
 *     content tracks one ID, and a client that synced past an older deleteCmd only drops
 *     the unpublished content when it receives the newest one.
 *   - Points `statusChangeDeleteCmdId` on each Draft at the deleteCmd kept, so the
 *     republish path can delete it by primary key.
 *
 * A point-in-time reconciliation, safe to run more than once.
 */
export async function reconcileStatusChangeDeleteCmds(db: DbService): Promise<void> {
    let deletedOrphans = 0;
    let backfilled = 0;
    let alreadyTracked = 0;

    // Collected first, so the newest of each content doc's deleteCmds is known before any
    // is deleted, and nothing is deleted while the paged scan is still running.
    const cmdsByContentId = new Map<string, StatusChangeCmd[]>();
    await db.processAllDocs([DocType.DeleteCmd], async (cmd: any) => {
        if (!cmd || cmd.deleteReason !== DeleteReason.StatusChange) return;
        const cmds = cmdsByContentId.get(cmd.docId) ?? [];
        cmds.push({ _id: cmd._id, updatedTimeUtc: cmd.updatedTimeUtc ?? 0 });
        cmdsByContentId.set(cmd.docId, cmds);
    });

    for (const [contentId, cmds] of cmdsByContentId) {
        const contentRes = await db.getDoc(contentId);
        const content = contentRes.docs[0];

        if (!content || content.status === PublishStatus.Published) {
            for (const cmd of cmds) await db.deleteDoc(cmd._id);
            deletedOrphans += cmds.length;
            continue;
        }

        // On a tie the one the content already tracks is kept, so no needless rewrite.
        const tracked: string | undefined = content.statusChangeDeleteCmdId;
        const keep = cmds.reduce((best, cmd) =>
            cmd.updatedTimeUtc > best.updatedTimeUtc ||
            (cmd.updatedTimeUtc === best.updatedTimeUtc && cmd._id === tracked)
                ? cmd
                : best,
        );

        for (const cmd of cmds) {
            if (cmd._id === keep._id) continue;
            await db.deleteDoc(cmd._id);
            deletedOrphans++;
        }

        if (tracked === keep._id) {
            alreadyTracked++;
            continue;
        }
        content.statusChangeDeleteCmdId = keep._id;
        await db.insertDoc(content);
        backfilled++;
    }

    console.info(
        `StatusChange deleteCmd reconciliation: ${deletedOrphans} orphan(s) deleted, ${backfilled} backfilled on draft docs, ${alreadyTracked} already-tracked`,
    );
}
