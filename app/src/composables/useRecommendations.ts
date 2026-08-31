import { computed, onScopeDispose, ref, watch } from "vue";
import {
    decay,
    ftsSearch,
    DocType,
    PublishStatus,
    type AffinityMap,
    type ContentDto,
    type Uuid,
    type FtsSearchResult,
    topTagsFrom,
} from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { useContentQueryWithState } from "@/composables/useContentQueryWithState";
import { affinityProfile } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import {
    highlightVersion,
    loadHighlightQueries,
    type HighlightQuery,
} from "@/recommendation/highlightStore";
import { searchVersion, loadSearchQueries, type SearchQuery } from "@/recommendation/searchQueryStore";
import { getSeenArticleIds, seenVersion } from "@/recommendation/seenStore";
import { appSyncedDisplayLanguageIdsAsRef } from "@/globalConfig";
import { sessionNow } from "@/util/sessionNow";
import { filterTopicTagIds } from "@/recommendation/topicTags";
import {
    rank,
    affinityScoreScale,
    RRF_K,
    TAG_LEG_WEIGHT,
    FTS_LEG_WEIGHT,
} from "@/recommendation/ranking";
// Re-export the pure ranking API (now in `ranking.ts`) so existing imports from
// `useRecommendations` — specs and `RecommendedForYou.vue` — keep working unchanged.
export {
    rank,
    affinityScoreScale,
    type RankOptions,
    NOMINAL_COMPLETION_WEIGHT,
    RRF_K,
    TAG_LEG_WEIGHT,
    FTS_LEG_WEIGHT,
    RECENCY_WEIGHT,
    RECENCY_HALFLIFE_DAYS,
    DAY_MS,
    MAX_PER_DOMINANT_TAG,
} from "@/recommendation/ranking";

const TOP_N_TAGS = 12;
/** Bounds the per-language search multiplier for the FTS/serendipity leg. */
const MAX_FTS_TAGS = 4;
/** Highlight text is a deliberate but supplementary discovery signal: its entire
 * contribution stays below a single strongest topic-title query. */
const HIGHLIGHT_FTS_TOTAL_WEIGHT = 0.3;
/** Submitted search queries are a parallel supplementary discovery signal — explicit intent
 * the user typed into the search modal. Parity with highlights: supplementary, kept below one
 * strongest topic-title query. */
const SEARCH_FTS_TOTAL_WEIGHT = 0.3;
/** Output cap on the fused feed. */
const DEFAULT_LIMIT = 20;
/** Candidate pool per leg. Must be >> DEFAULT_LIMIT: `useContentQuery` sorts by publishDate, so a
 *  pool of DEFAULT_LIMIT would mean affinity only reshuffles the 20 newest tagged docs instead of
 *  actually selecting from the tag neighbourhood. */
const DEFAULT_RETRIEVAL_LIMIT = 1000;
const FTS_DEBOUNCE_MS = 300;

/**
 * Personalized "Recommended for you" feed.
 *
 * Reads the local affinity profile plus active local highlights, then retrieves via TWO
 * independent legs:
 *  - **Tag membership**: a Mango `parentTags` query over the SAME hybridQuery path every
 *    feed uses, scored by the doc's own tag-affinity (a calibrated 0-1 value, contributed
 *    directly rather than collapsed to a rank).
 *  - **BM25/FTS**: up to four top tags' titles and up to four recent saved highlight
 *    excerpts run independently through the existing local full-text search (`ftsSearch`,
 *    offline, same engine as the search page), across the full display-language priority
 *    chain. Highlight excerpts share a deliberately small fixed weight, so they surface
 *    vocabulary-relevant content without displacing strong topic affinity. All searches
 *    fuse with the tag leg via RRF since BM25 scores aren't calibrated against its scale.
 *
 * Each leg retrieves `retrievalLimit` candidates; already-seen content is dropped after
 * fusion and the result is capped at `limit`. The UI stays empty only when neither topic
 * affinity nor active saved highlight text produces candidates.
 */
export type UseRecommendationsOptions = {
    /** Maximum number of unseen, fused recommendations to expose. Defaults to 20. */
    limit?: number;
    /**
     * Candidate pool fetched independently for each retrieval leg. It should be larger
     * than `limit` so affinity and RRF rank a meaningful neighbourhood. Defaults to 1000.
     */
    retrievalLimit?: number;
    /**
     * Whether to run the BM25/FTS leg (tag-title + saved-highlight local full-text search)
     * alongside the tag-membership leg. Defaults to true. Set false for a lighter, tag-only
     * feed — skips the tag-title lookup query, the saved-highlight reload, and every local
     * FTS scan entirely (no query objects are even created), trading search-grade precision
     * for materially less CPU. Useful for a small supplementary feed where a handful of
     * tag-matched results are enough (e.g. a secondary row on an already-loaded page).
     */
    useFts?: boolean;
};

export function useRecommendations({
    limit = DEFAULT_LIMIT,
    retrievalLimit = DEFAULT_RETRIEVAL_LIMIT,
    useFts = true,
}: UseRecommendationsOptions = {}) {
    // Decay once per profile update so the retrieval tags and the leg weighting are
    // based on precisely the same evidence.
    const decayedAffinity = computed(
        () => decay(affinityProfile.value, sessionNow(), affinityConfig.value).affinity,
    );
    const tags = computed(() => topTagsFrom(decayedAffinity.value, TOP_N_TAGS));
    // `$in` has set semantics. Keep its identity canonical so score-only reordering
    // does not rebuild the hybrid query or re-fetch its 1000-document candidate pool.
    const tagSet = computed(() => [...tags.value].sort());
    // Score-scale normalization: map raw affinity scores back to the nominal scale the
    // leg-weight constants were calibrated for, so rescaling the config weights only changes
    // update granularity, not ranking balance. No-op under the default config.
    const scoreScale = computed(() =>
        affinityScoreScale(affinityConfig.value.eventWeight.completion),
    );
    // 0 (cold: no real signal yet) .. 1 (well-earned affinity across the top tags) — used
    // to shift leg weight toward FTS early and toward tags once the profile has real
    // signal. Summed *score*, not tag count: a dozen barely-above-MIN_SCORE tags (e.g.
    // straight out of the impression-miss decay path) shouldn't read as "mature" just
    // because a slot is filled — richness should track how much evidence backs the
    // profile, not how many keys happen to exist in the map. The denominator is the
    // actual tag count (already capped at TOP_N_TAGS by topTagsFrom), not a fixed 12;
    // otherwise genuine high confidence on fewer tags is structurally capped at
    // (tag count)/12 of its true richness, undercounting the clearest signal we produce.
    // Multiplied by `scoreScale` so richness is measured on the nominal scale (see above).
    const richness = computed(() =>
        computeRichness(decayedAffinity.value, tags.value, scoreScale.value),
    );

    const { output: content, isFetching: contentIsFetching } = useContentQueryWithState(
        // No tags yet → a provably-empty `$in: []` so HybridQuery short-circuits
        // (no scan, no API call). Saved highlight FTS can still independently warm the feed.
        () =>
            tagSet.value.length
                ? [{ parentTags: { $elemMatch: { $in: tagSet.value } } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "recommended", limit: retrievalLimit },
    );

    // Which of the candidates' `parentTags` are actually TagType.Topic (categories and
    // audio playlists sit on most of the corpus and must not count toward tag-affinity
    // scoring or diversity — same restriction `recordAffinity` already applies on write).
    // `undefined` means topic-tag resolution is still in flight, so rank across all
    // candidate tags rather than briefly treating every candidate as non-topical.
    const topicTagIds = ref<Set<Uuid> | undefined>(undefined);
    let topicTagIdsRunSeq = 0;
    watch(
        content,
        async (docs) => {
            const runSeq = ++topicTagIdsRunSeq;
            const candidateTagIds = new Set<Uuid>();
            for (const doc of docs) for (const t of doc.parentTags ?? []) candidateTagIds.add(t);
            const ids = [...candidateTagIds];
            topicTagIds.value = undefined;
            try {
                const topicIds = await filterTopicTagIds(ids);
                // `content` can change again before this resolves; only the most recent run
                // may commit, otherwise an older, slower run can overwrite a newer result.
                if (runSeq !== topicTagIdsRunSeq) return;
                topicTagIds.value = new Set(topicIds);
            } catch {
                // `filterTopicTagIds` handles database failures; retain this guard for
                // unexpected errors in the watcher itself. Fall back to all tags rather
                // than incorrectly scoring every candidate as having no topic tags.
                if (runSeq === topicTagIdsRunSeq) topicTagIds.value = undefined;
            }
        },
        { immediate: true },
    );

    // ftsSearch is async and local-only (offline IndexedDB, same engine as the search
    // page) — run it in a watcher into a plain ref rather than forcing the whole
    // composable's reactivity through an async computed. Stays permanently empty when
    // `useFts` is false — none of the machinery below is even created in that case.
    const ftsResults = ref<FtsSearchResult[]>([]);

    if (useFts) {
        // Resolve the top tags' own titles (for FTS query synthesis). `useContentQuery`'s
        // default language-priority filter already collapses this to ~one doc per tag id.
        const tagContent = useContentQuery(
            () =>
                tagSet.value.length
                    ? [{ parentType: DocType.Tag }, { parentId: { $in: tagSet.value } }]
                    : [{ _id: { $in: [] } }],
            { cache: true, cacheId: "recommended-tag-titles", limit: TOP_N_TAGS * 2 },
        );

        // IndexedDB internals have no Vue reactivity. Reload the bounded saved-highlight
        // queries on startup and after SingleContent confirms a successful highlight save.
        const savedHighlightQueries = ref<HighlightQuery[]>([]);
        let highlightRunSeq = 0;
        watch(
            highlightVersion,
            async () => {
                const runSeq = ++highlightRunSeq;
                const queries = await loadHighlightQueries();
                if (runSeq === highlightRunSeq) savedHighlightQueries.value = queries;
            },
            { immediate: true },
        );

        // localStorage has no Vue reactivity either. Reload the bounded recent search queries
        // on startup and whenever the search modal records a new submit (`searchVersion`), so
        // what the user searches for feeds the FTS/serendipity leg alongside highlights.
        const savedSearchQueries = ref<SearchQuery[]>([]);
        let searchRunSeq = 0;
        watch(
            searchVersion,
            () => {
                const runSeq = ++searchRunSeq;
                const queries = loadSearchQueries();
                if (runSeq === searchRunSeq) savedSearchQueries.value = queries;
            },
            { immediate: true },
        );

        // Search the strongest topics independently so each vocabulary gets its own trigram
        // budget, then add fixed, modest total highlight and search budgets split across the
        // saved excerpts / recent queries — both kept below one strongest topic-title query.
        const ftsQueries = computed(() => {
            const topTagId = tags.value[0];
            const topAffinity = (topTagId && decayedAffinity.value[topTagId]) || 1;
            const tagQueries = tags.value.slice(0, MAX_FTS_TAGS).flatMap((tagId) => {
                const title = tagContent.value.find((t) => t.parentId === tagId)?.title;
                return title
                    ? [{ query: title, weight: (decayedAffinity.value[tagId] ?? 0) / topAffinity }]
                    : [];
            });
            const highlightWeight = savedHighlightQueries.value.length
                ? HIGHLIGHT_FTS_TOTAL_WEIGHT / savedHighlightQueries.value.length
                : 0;
            const searchWeight = savedSearchQueries.value.length
                ? SEARCH_FTS_TOTAL_WEIGHT / savedSearchQueries.value.length
                : 0;
            return [
                ...tagQueries,
                ...savedHighlightQueries.value.map(({ query }) => ({
                    query,
                    weight: highlightWeight,
                })),
                ...savedSearchQueries.value.map(({ query }) => ({
                    query,
                    weight: searchWeight,
                })),
            ];
        });

        let ftsRunSeq = 0;
        let ftsDebounceTimer: ReturnType<typeof setTimeout> | undefined;
        let lastFtsSignature: string | undefined;
        watch(
            // The language list is watched explicitly: it is only read inside the debounced
            // async callback below, which `watch` cannot track, so a display-language switch
            // would otherwise leave the previous language's hits in the feed until a restart.
            [ftsQueries, appSyncedDisplayLanguageIdsAsRef] as const,
            ([queries, languageIds]) => {
                // The computed rebuilds its array when upstream refs re-evaluate; only restart
                // retrieval when the query values themselves have meaningfully changed.
                const signature = JSON.stringify([
                    languageIds,
                    queries.map(({ query, weight }) => [query, weight.toFixed(4)]),
                ]);
                if (signature === lastFtsSignature) return;
                lastFtsSignature = signature;
                const runSeq = ++ftsRunSeq;
                if (ftsDebounceTimer) clearTimeout(ftsDebounceTimer);
                if (!queries.length) {
                    ftsResults.value = [];
                    return;
                }
                ftsDebounceTimer = setTimeout(async () => {
                    try {
                        const now = sessionNow();
                        const ftsSearches = await Promise.all(
                            queries.map(async ({ query, weight }) => {
                                // Search only locally synced languages in the user's preferred
                                // priority order: primary first, then downloaded fallbacks. The
                                // display default may be fetched on demand, but it is not a
                                // complete local FTS corpus and must not trigger a BM25 scan.
                                const perLanguage = await Promise.all(
                                    languageIds.map((languageId) =>
                                        ftsSearch({
                                            query,
                                            languageId,
                                            status: PublishStatus.Published,
                                            publishedBefore: now,
                                            limit: retrievalLimit,
                                        }),
                                    ),
                                );
                                const seenParentIds = new Set<Uuid>();
                                const merged: FtsSearchResult[] = [];
                                // Results remain parallel, but language-priority merge order is
                                // deterministic and duplicate translations keep the first hit.
                                for (const results of perLanguage) {
                                    for (const r of results) {
                                        if (seenParentIds.has(r.doc.parentId)) continue;
                                        // ftsSearch has no expiry filter — drop expired content
                                        // post-hoc (parity with the tag leg's mangoIsPublished).
                                        if (r.doc.expiryDate && r.doc.expiryDate < now) continue;
                                        seenParentIds.add(r.doc.parentId);
                                        merged.push(r);
                                        if (merged.length >= retrievalLimit) break;
                                    }
                                    if (merged.length >= retrievalLimit) break;
                                }
                                return { weight, results: merged };
                            }),
                        );
                        if (runSeq !== ftsRunSeq) return;
                        ftsResults.value = fuseTagFts(ftsSearches);
                    } catch {
                        // Offline FTS is best-effort here — a failure just means text signals
                        // contribute nothing; the tag-membership leg still works.
                        if (runSeq === ftsRunSeq) ftsResults.value = [];
                    }
                }, FTS_DEBOUNCE_MS);
            },
            { immediate: true },
        );
        // `watch` above is auto-stopped on scope dispose, but a pending `setTimeout` isn't —
        // without this, navigating away within FTS_DEBOUNCE_MS of an affinity write still
        // fires the full multi-language BM25 scan into a ref nobody reads anymore.
        onScopeDispose(() => clearTimeout(ftsDebounceTimer));
    }

    const seenIds = computed(() => {
        void seenVersion.value; // reactive dependency: getSeenArticleIds itself reads localStorage
        return new Set(getSeenArticleIds());
    });

    const recommended = computed(() => {
        // Filter seen content out *before* ranking/diversity-capping, not after — otherwise
        // already-seen docs still consume slots in the per-tag MMR cap and push unseen
        // content into overflow (and past `slice(0, limit)` entirely).
        const unseenTagCandidates = content.value.filter((c) => !seenIds.value.has(c._id));
        const unseenFtsCandidates = ftsResults.value.filter((r) => !seenIds.value.has(r.docId));
        return rank(unseenTagCandidates, unseenFtsCandidates, decayedAffinity.value, {
            topicTagIds: topicTagIds.value,
            tagWeight: TAG_LEG_WEIGHT * (0.3 + 0.7 * richness.value),
            ftsWeight: FTS_LEG_WEIGHT * (1 - 0.5 * richness.value),
            scoreScale: scoreScale.value,
            limit,
        });
    });

    return {
        recommended,
        // Reflects only the tag-membership leg's own resolution (the `content` query above),
        // not the FTS leg. The HomePage caller uses the default `useFts: true`, so it does not
        // gate on a fully inclusive readiness signal today; a caller that did would need this
        // extended to track the FTS leg too.
        ready: computed(() => !contentIsFetching.value),
    };
}

/**
 * Profile signal strength across its selected tags. Exported for unit testing.
 * `scoreScale` maps raw scores back to the nominal scale the leg weights were calibrated for
 * (see {@link NOMINAL_COMPLETION_WEIGHT}); defaults to 1 so existing callers/tests are unchanged.
 */
export function computeRichness(decayedAffinity: AffinityMap, tags: Uuid[], scoreScale = 1): number {
    if (!tags.length) return 0;
    const total = tags.reduce((sum, id) => sum + (decayedAffinity[id] ?? 0), 0);
    return Math.min(1, (total / tags.length) * scoreScale);
}

/** Affinity-weight independent FTS result lists into one ordered leg. Exported for unit testing. */
export function fuseTagFts(
    tagSearches: { weight: number; results: FtsSearchResult[] }[],
): FtsSearchResult[] {
    const fused = new Map<Uuid, { doc: ContentDto; score: number }>();

    for (const { weight, results } of tagSearches) {
        results.forEach((result, i) => {
            const existing = fused.get(result.docId);
            const contribution = weight * ((RRF_K + 1) / (RRF_K + i + 1));
            fused.set(result.docId, {
                doc: existing?.doc ?? result.doc,
                score: (existing?.score ?? 0) + contribution,
            });
        });
    }

    return [...fused.entries()]
        .sort(([, a], [, b]) => b.score - a.score)
        .map(([docId, { doc, score }]) => ({ docId, doc, score, wordMatchScore: 0 }));
}
