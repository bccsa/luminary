/**
 * Whether a DeleteCmd has been overtaken by its own target.
 *
 * A DeleteCmd is a point-in-time instruction, but it outlives the state that produced it:
 * an unpublish emits one, and a later republish leaves it sitting there still naming a doc
 * that is live again. Applying it then deletes current content. Both the client sync
 * (`bulkPut`) and the SSG build resolve deletes from the same DeleteCmd stream, so they
 * share this rule rather than each re-deriving it.
 *
 * Keep this module PURE: no Dexie/Vue/DOM — it runs in the browser and in the SSG's Node build.
 */

/** Only the timestamp matters; callers pass whole DTOs. */
export type DeleteCmdStalenessDoc = { updatedTimeUtc: number };

/**
 * True when `target` is at-or-newer than the cmd, meaning the delete is obsolete and must
 * be skipped. An absent target is NOT superseded — the doc really is gone, which is the
 * ordinary case a DeleteCmd exists for.
 */
export function isDeleteCmdSuperseded(
    cmd: DeleteCmdStalenessDoc,
    target: DeleteCmdStalenessDoc | undefined,
): boolean {
    if (!target) return false;
    return target.updatedTimeUtc >= cmd.updatedTimeUtc;
}
