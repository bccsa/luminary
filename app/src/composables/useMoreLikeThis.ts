import { computed, ref, watch } from "vue";
import {
    decay,
    ftsSearch,
    PublishStatus,
    affinityConfig,
    type AffinityMap,
    type ContentDto,
    type FtsSearchResult,
} from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { affinityProfile } from "@/recommendation/affinityStore";
import { loadHighlightQueriesFor } from "@/recommendation/highlightStore";
import { sessionNow } from "@/util/sessionNow";
import { fuseTagFts, rank } from "@/composables/useRecommendations";

/** The title/summary query is the primary retrieval signal; the reader's own saved
 *  highlights on this article are a stronger, more specific signal than the global
 *  highlight leg `useRecommendations` mixes in (weight 0.3 there), but must still stay
 *  below the primary query so retrieval doesn't drift off-topic. */
const OWN_HIGHLIGHT_FTS_TOTAL_WEIGHT = 0.5;

export type UseMoreLikeThisOptions = {
    limit?: number;
    retrievalLimit?: number;
};

/**
 * Personalized "similar articles" for a single piece of content — retrieval stays purely
 * topical (seeded only from the article's own tags/title/summary, same as useRecommendations'
 * tag+FTS legs), while rank()'s existing tag-affinity scoring naturally tilts the ordering
 * toward the viewer's own interests among already-topical candidates — never a separate,
 * off-topic-risking retrieval leg.
 * Also exposes `ready`, which flips true once this leg's own FTS retrieval has completed at least once for the current selected content.
 */
export function useMoreLikeThis(
    getSelectedContent: () => ContentDto | undefined,
    getSeedTags: () => ContentDto[],
    { limit = 10, retrievalLimit = 200 }: UseMoreLikeThisOptions = {},
) {
    const selectedContent = computed(getSelectedContent);
    const seedTags = computed(getSeedTags);
    const seedTagIds = computed(() => seedTags.value.map((tag) => tag.parentId));
    const topicTagIdSet = computed(() => new Set(seedTagIds.value));
    const excludeId = computed(() => selectedContent.value?._id);
    const excludeParentId = computed(() => selectedContent.value?.parentId);

    const tagContent = useContentQuery(
        () =>
            seedTagIds.value.length
                ? [{ parentTags: { $elemMatch: { $in: seedTagIds.value } } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "more-like-this-tags", limit: retrievalLimit },
    );

    const ftsResults = ref<FtsSearchResult[]>([]);
    /** Flips false at the start of each retrieval run and true once it finishes (success,
     *  early return, or error). Lets a caller that merges this into a larger list (e.g.
     *  useRelatedFeed) wait for this leg's own FTS work rather than showing a snapshot
     *  that's missing it and then swapping it in once it resolves. */
    const ready = ref(false);
    watch(
        selectedContent,
        async (doc) => {
            ready.value = false;
            try {
                if (!doc) {
                    ftsResults.value = [];
                    return;
                }
                const queryText = [doc.title, doc.summary].filter(Boolean).join(" ").trim();
                const highlightQueries = await loadHighlightQueriesFor(doc._id);
                if (!queryText && !highlightQueries.length) {
                    ftsResults.value = [];
                    return;
                }
                const search = (query: string) =>
                    ftsSearch({
                        query,
                        languageId: doc.language,
                        status: PublishStatus.Published,
                        publishedBefore: sessionNow(),
                        limit: retrievalLimit,
                    });
                const searches: { weight: number; results: FtsSearchResult[] }[] = [];
                if (queryText) searches.push({ weight: 1, results: await search(queryText) });
                if (highlightQueries.length) {
                    const perHighlightWeight =
                        OWN_HIGHLIGHT_FTS_TOTAL_WEIGHT / highlightQueries.length;
                    const highlightResults = await Promise.all(
                        highlightQueries.map(({ query }) => search(query)),
                    );
                    for (const results of highlightResults) {
                        searches.push({ weight: perHighlightWeight, results });
                    }
                }
                ftsResults.value = fuseTagFts(searches);
            } catch {
                ftsResults.value = [];
            } finally {
                ready.value = true;
            }
        },
        { immediate: true },
    );

    const decayedAffinity = computed<AffinityMap>(
        () => decay(affinityProfile.value, sessionNow(), affinityConfig.value).affinity,
    );

    const similar = computed(() => {
        const tagCandidates = tagContent.value.filter(
            (doc) => doc._id !== excludeId.value && doc.parentId !== excludeParentId.value,
        );
        const ftsCandidates = ftsResults.value.filter(
            (result) =>
                result.docId !== excludeId.value && result.doc.parentId !== excludeParentId.value,
        );
        return rank(tagCandidates, ftsCandidates, decayedAffinity.value, {
            topicTagIds: topicTagIdSet.value,
            limit,
        });
    });

    return { similar, ready };
}
