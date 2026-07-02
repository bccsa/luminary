import { UserDto } from "../../dto/UserDto";
import { computeFtsData, USER_FTS_FIELDS } from "../../util/ftsIndexing";

/**
 * Process User DTO — compute the server-authoritative trigram FTS index over name + email so
 * the strict `/fts` search can find users without a full table scan. `undefined` when there's
 * no indexable text, which also clears a stale index when name/email are removed on edit.
 */
export default async function processUserDto(doc: UserDto): Promise<void> {
    const ftsData = computeFtsData(doc, USER_FTS_FIELDS);
    doc.fts = ftsData ? ftsData.fts : undefined;
}
