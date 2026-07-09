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
import { appDisplayLanguageIdsAsRef } from "@/globalConfig";
import { sessionNow } from "@/util/sessionNow";

const TOP_N_TAGS = 5;
const LIMIT = 20;
/** Reciprocal Rank Fusion constant (Cormack et al. 2009's default — de-weights rank
 *  swings far down either list without needing per-source score normalization). */
const RRF_K = 60;

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
 * Already-seen content is dropped after fusion. Cold profile ⇒ empty (the UI hides itself).
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
                    limit: LIMIT,
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

    const seen = computed(() => new Set(getSeenContentIds()));

    const recommended = computed(() =>
        rank([...content.value], ftsResults.value, affinityProfile.value.affinity).filter(
            (c) => !seen.value.has(c._id),
        ),
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
        rrfScore.set(doc._id, (rrfScore.get(doc._id) ?? 0) + 1 / (RRF_K + i + 1));
    });
    ftsCandidates.forEach((result, i) => {
        if (!docs.has(result.docId)) docs.set(result.docId, result.doc);
        rrfScore.set(result.docId, (rrfScore.get(result.docId) ?? 0) + 1 / (RRF_K + i + 1));
    });

    return [...rrfScore.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => docs.get(id))
        .filter((d): d is ContentDto => !!d);
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
