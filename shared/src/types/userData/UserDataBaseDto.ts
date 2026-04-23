import type { BaseDocumentDto, Uuid } from "../dto";

/**
 * Base shape shared by all user-private docs stored in the partitioned
 * userdata database. The `_id` is required to start with `{userId}:` —
 * the prefix is the CouchDB partition key and the isolation boundary.
 *
 * `updatedTimeUtc` (inherited from BaseDocumentDto) drives last-write-wins
 * conflict resolution across a user's devices.
 */
export type UserDataBaseDto = BaseDocumentDto & {
    userId: Uuid;
    createdAt: number;
};
