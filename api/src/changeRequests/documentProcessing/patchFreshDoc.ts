import { DbService } from "../../db/db.service";
import { Uuid } from "../../enums";

/**
 * Re-reads a document and applies `patch` to that copy before writing it, so a cascade
 * onto a related doc only changes the fields it owns. Writing a copy read earlier in the
 * request would undo whatever a concurrent save changed on that doc in the meantime.
 */
export async function patchFreshDoc<T>(
    db: DbService,
    id: Uuid,
    patch: (doc: T) => void,
): Promise<void> {
    const { docs } = await db.getDoc(id);
    if (!docs.length) return;
    const fresh = docs[0] as T;
    patch(fresh);
    await db.upsertDoc(fresh);
}
