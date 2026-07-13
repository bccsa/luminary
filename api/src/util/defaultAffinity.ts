/**
 * Fixed `_id` of the singleton `DefaultAffinityDto` (the CMS-managed cold-start
 * baseline profile). Mirror of shared's `DEFAULT_AFFINITY_ID` — keep in sync.
 * There is exactly one DefaultAffinity doc, group-scoped and CMS-edited.
 */
export const DEFAULT_AFFINITY_ID = "default-affinity";
