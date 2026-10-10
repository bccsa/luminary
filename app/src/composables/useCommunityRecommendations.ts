import { computed, ref, watch } from "vue";
import { topTagsFrom, type ContentDto, type Uuid } from "luminary-shared";
import { useContentQueryWithState } from "@/composables/useContentQueryWithState";
import { globalAffinity } from "@/recommendation/globalAffinityStore";
import { getSeenArticleIds, seenVersion } from "@/recommendation/seenStore";
import { sessionNow } from "@/util/sessionNow";
import { filterTopicTagIds } from "@/recommendation/topicTags";
import { rank, TAG_LEG_WEIGHT, MAX_RECOMMENDATIONS } from "@/recommendation/ranking";

const TOP_N_TAGS = 12;
const DEFAULT_RETRIEVAL_LIMIT = 1000;

/**
 * "Others are interested in" — a feed ranked from the audience-wide affinity profile.
 *
 * Deliberately separate from {@link useRecommendations} rather than another leg inside it:
 * the user owns their own profile, and mixing an audience-level prior into it would make
 * their feed drift toward the crowd. This composable reads only `globalAffinity` and never
 * writes any affinity state, so browsing the community row cannot reshape either profile.
 *
 * Single retrieval leg (tag membership) reusing the same ranker as the personal feed. There
 * is no BM25 leg: that one is seeded from the user's own highlights and searches, which have
 * no place in a feed that is explicitly not about them.
 */
export type UseCommunityRecommendationsOptions = {
    /** Maximum unseen results to expose. Clamped by the engine-wide ceiling. */
    limit?: number;
    /** Candidate pool; should exceed `limit` so affinity ranks a real neighbourhood. */
    retrievalLimit?: number;
};

const hasPinnedParent = (doc: ContentDto) => !!doc.parentPinned && doc.parentPinned > 0;

export function useCommunityRecommendations({
    limit = MAX_RECOMMENDATIONS,
    retrievalLimit = DEFAULT_RETRIEVAL_LIMIT,
}: UseCommunityRecommendationsOptions = {}) {
    // No decay here: the stored map is already decayed server-side at every flush, and a
    // client has no business second-guessing the aggregate's clock.
    const tags = computed(() => topTagsFrom(globalAffinity.value, TOP_N_TAGS));
    // `$in` has set semantics — keep its identity canonical so score-only reordering does
    // not rebuild the query and re-fetch its candidate pool.
    const tagSet = computed(() => [...tags.value].sort());

    // Global scores start near zero and creep up as contributions accumulate, so their
    // absolute magnitude tracks adoption rather than interest. Scale the strongest tag to 1
    // so the tag-leg-vs-recency balance is the same on day one as it is a year in.
    const scoreScale = computed(() => {
        const top = globalAffinity.value[tags.value[0]] ?? 0;
        return top > 0 ? 1 / top : 1;
    });

    const { output: content, isFetching } = useContentQueryWithState(
        () =>
            tagSet.value.length
                ? [{ parentTags: { $elemMatch: { $in: tagSet.value } } }]
                : [{ _id: { $in: [] } }],
        { limit: retrievalLimit, keepPreviousResult: true },
    );

    // Which candidate tags are actually TagType.Topic — categories and playlists sit on most
    // of the corpus and must not count toward scoring or diversity. Mirrors the personal feed.
    const topicTagIds = ref<Set<Uuid> | undefined>(undefined);
    const isTopicTag = new Map<Uuid, boolean>();
    let runSeq = 0;
    watch(
        content,
        async (docs) => {
            const seq = ++runSeq;
            const candidateTagIds = new Set<Uuid>();
            for (const doc of docs) for (const t of doc.parentTags ?? []) candidateTagIds.add(t);
            if (!candidateTagIds.size) return;
            const unresolved = [...candidateTagIds].filter((id) => !isTopicTag.has(id));
            if (unresolved.length) {
                let topicIds: Set<Uuid>;
                try {
                    topicIds = new Set(await filterTopicTagIds(unresolved));
                } catch {
                    // Treat them as topics rather than scoring every candidate as having none.
                    topicIds = new Set(unresolved);
                }
                if (seq !== runSeq) return;
                for (const id of unresolved) isTopicTag.set(id, topicIds.has(id));
            }
            topicTagIds.value = new Set([...candidateTagIds].filter((id) => isTopicTag.get(id)));
        },
        { immediate: true },
    );

    const seenIds = computed(() => {
        void seenVersion.value; // reactive dependency: getSeenArticleIds reads localStorage
        return new Set(getSeenArticleIds());
    });

    const recommended = computed(() => {
        const eligible = content.value.filter(
            (c) => !seenIds.value.has(c._id) && !hasPinnedParent(c),
        );
        return rank(eligible, [], globalAffinity.value, {
            topicTagIds: topicTagIds.value,
            tagWeight: TAG_LEG_WEIGHT,
            ftsWeight: 0,
            scoreScale: scoreScale.value,
            limit,
            now: sessionNow(),
        });
    });

    return {
        recommended,
        ready: computed(() => !isFetching.value),
    };
}
