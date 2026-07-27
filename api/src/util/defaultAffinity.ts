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
 * doc's `config` is absent or a field within it fails validation. Weights and `minScore`
 * live on a fine-grained scale (see shared's doc comment) — rescaling this whole block
 * keeps ranking balance invariant via the nominal-completion anchor in `useRecommendations`.
 */
export const DEFAULT_AFFINITY_CONFIG: AffinityConfigDto = {
    halfLifeDays: 45,
    hitWeight: 0.0004,
    minScore: 0.0001,
    maxTags: 50,
    depthScale: 20,
    readFloorPercent: 20,
    eventWeight: {
        bookmark: 0.0025,
        bookmarkRemoved: -0.0015,
        completion: 0.0035,
        readCompletion: 0.0035,
        highlight: 0.003,
        highlightRemoved: -0.0018,
        searchClick: 0.0004,
        impression: -0.0002,
    },
};
