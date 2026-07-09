import { computed } from "vue";
import { topTags, type AffinityMap, type ContentDto, type Uuid } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { affinityProfile } from "@/recommendation/affinityStore";

const TOP_N_TAGS = 5;
const LIMIT = 20;

/**
 * Personalized "Recommended for you" feed.
 *
 * Reads the local affinity profile → top tags → a tag-affinity query over the SAME
 * hybridQuery path every feed uses → ranks candidates by tag-affinity overlap →
 * drops already-seen content. Cold profile ⇒ empty (the UI hides itself).
 *
 * `rank()` is intentionally a seam: it is tag-overlap only for now, but FTS + RRF
 * fusion can drop in here later without touching the call site.
 */
export function useRecommendations() {
    const tags = computed(() => topTags(affinityProfile.value, TOP_N_TAGS));

    const content = useContentQuery(
        // No tags yet → a provably-empty `$in: []` so HybridQuery short-circuits
        // (no scan, no API call) and the feed stays empty until the profile warms up.
        () =>
            tags.value.length
                ? [{ parentTags: { $elemMatch: { $in: tags.value } } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "recommended", limit: LIMIT },
    );

    const seen = computed(() => new Set(getSeenContentIds()));

    const recommended = computed(() =>
        rank([...content.value], affinityProfile.value.affinity).filter(
            (c) => !seen.value.has(c._id),
        ),
    );

    return { recommended, hasTags: computed(() => tags.value.length > 0) };
}

/** Rank candidates by summed affinity of their tags (the FTS+RRF drop-in seam). */
function rank(docs: ContentDto[], affinity: AffinityMap): ContentDto[] {
    return docs
        .map((doc) => ({ doc, score: tagScore(doc, affinity) }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.doc);
}

function tagScore(doc: ContentDto, affinity: AffinityMap): number {
    let score = 0;
    for (const tag of doc.parentTags ?? []) score += affinity[tag] ?? 0;
    return score;
}

/** Content ids the user has already engaged with (reuses the mediaProgress list). */
function getSeenContentIds(): Uuid[] {
    try {
        const list = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        return Array.isArray(list) ? list.map((e: { contentId: Uuid }) => e.contentId) : [];
    } catch {
        return [];
    }
}
