import type { Uuid } from "../dto";

/**
 * Deterministic `_id` builders. userId is always the partition-key prefix —
 * enforced at the storage layer, but constructing IDs through these helpers
 * keeps the convention a single source of truth.
 */
export const userDataIds = {
    userContent: (userId: Uuid, contentId: Uuid): string =>
        `${userId}:userContent:${contentId}`,
    settings: (userId: Uuid): string => `${userId}:settings`,
};

/**
 * Extracts the userId (partition key) from a user-data doc `_id`.
 * Returns null if the id isn't in the expected form — callers should treat
 * that as a validation failure, not a missing userId.
 */
export const partitionKeyOf = (docId: string): Uuid | null => {
    const idx = docId.indexOf(":");
    return idx > 0 ? docId.slice(0, idx) : null;
};
