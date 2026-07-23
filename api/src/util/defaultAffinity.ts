import { AffinityConfigDto } from "../dto/DefaultAffinityDto";

/**
 * Fixed `_id` of the singleton `DefaultAffinityDto` (the CMS-managed cold-start
 * baseline profile). Mirror of shared's `DEFAULT_AFFINITY_ID` — keep in sync.
 * There is exactly one DefaultAffinity doc, group-scoped and CMS-edited.
 */
export const DEFAULT_AFFINITY_ID = "default-affinity";

/**
 * Mirror of shared's `DEFAULT_AFFINITY_CONFIG` (`shared/src/recommendation/affinity.ts`)
 * — keep both in sync. Used as the seed value and as the fallback whenever the singleton
 * doc's `config` is absent or a field within it fails validation.
 */
export const DEFAULT_AFFINITY_CONFIG: AffinityConfigDto = {
    halfLifeDays: 45,
    hitWeight: 0.04,
    minScore: 0.01,
    maxTags: 50,
    depthScale: 20,
    readFloorPercent: 20,
    eventWeight: {
        bookmark: 0.25,
        bookmarkRemoved: -0.15,
        completion: 0.35,
        readCompletion: 0.35,
        highlight: 0.3,
        highlightRemoved: -0.18,
        impression: -0.02,
    },
};
