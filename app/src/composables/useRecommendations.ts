import { computed, ref, watch } from "vue";
import {
    topTags,
    ftsSearch,
    DocType,
    PublishStatus,
    type AffinityMap,
    type ContentDto,
    type Uuid,
    type FtsSearchResult,
} from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { affinityProfile } from "@/recommendation/affinityStore";
import { getSeenArticleIds, seenVersion } from "@/recommendation/seenStore";
import { appDisplayLanguageIdsAsRef } from "@/globalConfig";
import { sessionNow } from "@/util/sessionNow";

const TOP_N_TAGS = 12;
/** Output cap on the fused feed. */
const DEFAULT_LIMIT = 20;
/** Candidate pool per leg. Must be >> DEFAULT_LIMIT: `useContentQuery` sorts by publishDate, so a
 *  pool of DEFAULT_LIMIT would mean affinity only reshuffles the 20 newest tagged docs instead of
 *  actually selecting from the tag neighbourhood. */
const DEFAULT_RETRIEVAL_LIMIT = 1000;
/** Reciprocal Rank Fusion constant (Cormack et al. 2009's default — de-weights rank
 *  swings far down either list without needing per-source score normalization). */
const RRF_K = 60;
/** Tag-affinity leg is the actual personalization signal; FTS is the serendipity leg
 *  (vocabulary match, not affinity match) — it should contribute, not co-decide. */
const TAG_LEG_WEIGHT = 1.5;
const FTS_LEG_WEIGHT = 1;

/**
 * Personalized "Recommended for you" feed.
 *
 * Reads the local affinity profile → top tags, then retrieves via TWO independent legs
 * fused by Reciprocal Rank Fusion:
 *  - **Tag membership**: a Mango `parentTags` query over the SAME hybridQuery path every
 *    feed uses, ranked by summed tag-affinity overlap.
 *  - **BM25/FTS**: the top tags' own titles synthesized into a query string and run
 *    through the existing local full-text search (`ftsSearch`, offline, same engine as
 *    the search page) — surfaces content that matches the user's interests by vocabulary
 *    even when it isn't literally tagged with one of the top tags (the "serendipity" leg).
 *
 * Each leg retrieves `retrievalLimit` candidates; already-seen content is dropped after
 * fusion and the result is capped at `limit`. Cold profile ⇒ empty (the UI hides itself).
 */
export type UseRecommendationsOptions = {
    /** Maximum number of unseen, fused recommendations to expose. Defaults to 20. */
    limit?: number;
    /**
     * Candidate pool fetched independently for each retrieval leg. It should be larger
     * than `limit` so affinity and RRF rank a meaningful neighbourhood. Defaults to 1000.
     */
    retrievalLimit?: number;
};

export function useRecommendations({
    limit = DEFAULT_LIMIT,
    retrievalLimit = DEFAULT_RETRIEVAL_LIMIT,
}: UseRecommendationsOptions = {}) {
    const tags = computed(() => topTags(affinityProfile.value, TOP_N_TAGS));

    const content = useContentQuery(
        // No tags yet → a provably-empty `$in: []` so HybridQuery short-circuits
        // (no scan, no API call) and the feed stays empty until the profile warms up.
        () =>
            tags.value.length
                ? [{ parentTags: { $elemMatch: { $in: tags.value } } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "recommended", limit: retrievalLimit },
    );

    // Resolve the top tags' own titles (for FTS query synthesis). `useContentQuery`'s
    // default language-priority filter already collapses this to ~one doc per tag id.
    const tagContent = useContentQuery(
        () =>
            tags.value.length
                ? [{ parentType: DocType.Tag }, { parentId: { $in: tags.value } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "recommended-tag-titles", limit: TOP_N_TAGS * 2 },
    );

    const ftsQuery = computed(() =>
        tags.value
            .map((id) => tagContent.value.find((t) => t.parentId === id)?.title)
            .filter((t): t is string => !!t)
            .join(" "),
    );

    // ftsSearch is async and local-only (offline IndexedDB, same engine as the search
    // page) — run it in a watcher into a plain ref rather than forcing the whole
    // composable's reactivity through an async computed.
    const ftsResults = ref<FtsSearchResult[]>([]);
    watch(
        ftsQuery,
        async (query) => {
            if (!query) {
                ftsResults.value = [];
                return;
            }
            try {
                const now = sessionNow();
                const results = await ftsSearch({
                    query,
                    languageId: appDisplayLanguageIdsAsRef.value[0],
                    status: PublishStatus.Published,
                    publishedBefore: now,
                    limit: retrievalLimit,
                });
                // ftsSearch has no expiry filter — drop expired content post-hoc (parity
                // with the tag leg's mangoIsPublished check).
                ftsResults.value = results.filter(
                    (r) => !r.doc.expiryDate || r.doc.expiryDate >= now,
                );
            } catch {
                // Offline FTS is best-effort here — a failure just means this leg
                // contributes nothing; the tag-membership leg still works.
                ftsResults.value = [];
            }
        },
        { immediate: true },
    );

    const seen = computed(() => {
        void seenVersion.value; // reactive dependency: getSeenContentIds itself reads localStorage
        return new Set(getSeenContentIds());
    });

    const recommended = computed(() =>
        rank([...content.value], ftsResults.value, affinityProfile.value.affinity)
            .filter((c) => !seen.value.has(c._id))
            .slice(0, limit),
    );

    return { recommended, hasTags: computed(() => tags.value.length > 0) };
}

/**
 * Fuse the tag-membership leg (ranked by affinity overlap) and the FTS leg (already
 * BM25-ranked) via Reciprocal Rank Fusion: a doc's score is the sum of `1/(k+rank)`
 * across every list it appears in (0 from a list it's absent from). Rank position
 * (not raw score) is what's combined, so the two legs need no score normalization
 * against each other. Exported for unit testing.
 */
export function rank(
    tagCandidates: ContentDto[],
    ftsCandidates: FtsSearchResult[],
    affinity: AffinityMap,
): ContentDto[] {
    const byTagScore = [...tagCandidates].sort(
        (a, b) => tagScore(b, affinity) - tagScore(a, affinity),
    );

    const rrfScore = new Map<Uuid, number>();
    const docs = new Map<Uuid, ContentDto>();

    byTagScore.forEach((doc, i) => {
        docs.set(doc._id, doc);
        rrfScore.set(doc._id, (rrfScore.get(doc._id) ?? 0) + TAG_LEG_WEIGHT / (RRF_K + i + 1));
    });
    ftsCandidates.forEach((result, i) => {
        if (!docs.has(result.docId)) docs.set(result.docId, result.doc);
        rrfScore.set(result.docId, (rrfScore.get(result.docId) ?? 0) + FTS_LEG_WEIGHT / (RRF_K + i + 1));
    });

    return [...rrfScore.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => docs.get(id))
        .filter((d): d is ContentDto => !!d);
}

/** Average, not sum, so a doc with many weak tags can't outrank one with a single
 *  tag the user genuinely has strong affinity for. */
function tagScore(doc: ContentDto, affinity: AffinityMap): number {
    const tags = doc.parentTags ?? [];
    if (!tags.length) return 0;
    let score = 0;
    for (const tag of tags) score += affinity[tag] ?? 0;
    return score / tags.length;
}

/** Content ids the user has already engaged with: audio/video progress (mediaProgress)
 *  plus articles marked seen via a dwell-gated open (see `seenStore`). */
function getSeenContentIds(): Uuid[] {
    try {
        const list = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        const mediaIds = Array.isArray(list)
            ? list.map((e: { contentId: Uuid }) => e.contentId)
            : [];
        return [...mediaIds, ...getSeenArticleIds()];
    } catch {
        return getSeenArticleIds();
    }
}
