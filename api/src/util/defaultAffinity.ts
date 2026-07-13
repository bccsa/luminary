import { Uuid } from "../enums";

/**
 * `_id` prefix for a {@link UserAffinityDto}. Mirror of shared's
 * `USER_AFFINITY_ID_PREFIX` — keep the two in sync.
 */
export const USER_AFFINITY_ID_PREFIX = "user-affinity-";

/** Deterministic affinity-doc id for a user (= the User doc `_id`). */
export const userAffinityId = (userId: Uuid): string => `${USER_AFFINITY_ID_PREFIX}${userId}`;

/**
 * Fixed `_id` of the singleton `DefaultAffinityDto` (the CMS-managed cold-start
 * baseline profile). Mirror of shared's `DEFAULT_AFFINITY_ID` — keep in sync.
 * Unlike `userAffinityId`, this is not a function of a userId: there is exactly
 * one DefaultAffinity doc, group-scoped and CMS-edited (not owner-scoped).
 */
export const DEFAULT_AFFINITY_ID = "default-affinity";
