import { Uuid } from "../enums";

/**
 * `_id` prefix for a {@link UserAffinityDto}. Mirror of shared's
 * `USER_AFFINITY_ID_PREFIX` — keep the two in sync.
 */
export const USER_AFFINITY_ID_PREFIX = "user-affinity-";

/** Deterministic affinity-doc id for a user (= the User doc `_id`). */
export const userAffinityId = (userId: Uuid): string => `${USER_AFFINITY_ID_PREFIX}${userId}`;
