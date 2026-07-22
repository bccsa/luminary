import { computed, onScopeDispose, ref, watch } from "vue";
import {
    decay,
    ftsSearch,
    DocType,
    PostType,
    PublishStatus,
    TagType,
    type AffinityMap,
    type ContentDto,
    type Uuid,
    type FtsSearchResult,
    tierWeightForRank,
    topTagsFrom,
} from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { affinityProfile } from "@/recommendation/affinityStore";
import {
    highlightVersion,
    loadHighlightQueries,
    type HighlightQuery,
} from "@/recommendation/highlightStore";
import { getSeenArticleIds, seenVersion } from "@/recommendation/seenStore";
import { appSyncedDisplayLanguageIdsAsRef } from "@/globalConfig";
import { sessionNow } from "@/util/sessionNow";
import { filterTopicTagIds } from "@/recommendation/topicTags";

/** Top ten retrieval tags, aligned with the established tier's rank ceiling. */
const TOP_N_TAGS = 10;
/** Bounds the per-language search multiplier for the FTS/serendipity leg. */
const MAX_FTS_TAGS = 4;
/** Highlight text is a deliberate but supplementary discovery signal: its entire
 * contribution stays below a single strongest topic-title query. */
const HIGHLIGHT_FTS_TOTAL_WEIGHT = 0.3;
/** Output cap on the fused feed. */
const DEFAULT_LIMIT = 20;
/** One newest under-represented topic item is deliberately reserved for exploration. */
const EXPLORATION_SLOT_COUNT = 1;
/** Small recency-ordered pool: one newest eligible exploration item is all we need. */
const EXPLORATION_POOL_LIMIT = 100;
/** Candidate pool per leg. Must be >> DEFAULT_LIMIT: `useContentQuery` sorts by publishDate, so a
 *  pool of DEFAULT_LIMIT would mean affinity only reshuffles the 20 newest tagged docs instead of
 *  actually selecting from the tag neighbourhood. */
const DEFAULT_RETRIEVAL_LIMIT = 1000;
/** Best-effort RRF tuning pending offline evaluation: 10 preserves meaningful top-rank
 *  separation after normalization while still de-weighting swings farther down the list. */
const RRF_K = 10;
/** Base leg weights, scaled by profile richness (see `richness` below): a cold profile
 *  (few learned topics) leans on the FTS/serendipity leg; a rich one leans on tags. */
const TAG_LEG_WEIGHT = 1.5;
/** Best-effort pending offline evaluation: 0.4 aligns top FTS hits with strong real tag contributions (~0.07-0.4). */
const FTS_LEG_WEIGHT = 0.4;
/** A mild prior so two equally-tagged docs don't tie and fall back to insertion order —
 *  small relative to the leg weights so it nudges, not dominates. */
/** Best-effort pending offline evaluation: 0.05 stays below realistic tag contributions and acts as a tie-breaker. */
const RECENCY_WEIGHT = 0.05;
const RECENCY_HALFLIFE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
/** MMR-lite diversification: caps how many docs sharing the same dominant tag can land
 *  in the ranked list before the rest of that tag's matches get pushed down. Without
 *  this the top of the feed is whichever single tag scores highest. */
const MAX_PER_DOMINANT_TAG = 3;
const FTS_DEBOUNCE_MS = 300;

/**
 * Personalized "Recommended for you" feed.
 *
 * Reads the local affinity profile plus active local highlights, then retrieves via TWO
 * independent legs:
 *  - **Tag membership**: a Mango `parentTags` query over the SAME hybridQuery path every
 *    feed uses, seeded by the top ten tags and scored by the doc's own tag-affinity after
 *    its rank-tier retrieval multiplier is applied (then contributed directly rather than
 *    collapsed to a rank).
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
 *
 * When available, one final slot is reserved for the newest unseen item from a topic outside
 * the user's current top-ten affinity tags. It remains a normal recommendation so existing
 * impression-miss and click-affinity feedback closes the exploration loop.
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
    // Decay once per profile update so the retrieval tags and the leg weighting are
    // based on precisely the same evidence.
    const decayedAffinity = computed(() => decay(affinityProfile.value, sessionNow()).affinity);
    const tags = computed(() => topTagsFrom(decayedAffinity.value, TOP_N_TAGS));
    // `$in` has set semantics. Keep its identity canonical so score-only reordering
    // does not rebuild the hybrid query or re-fetch its 1000-document candidate pool.
    const tagSet = computed(() => [...tags.value].sort());
    // 0 (cold: no real signal yet) .. 1 (well-earned affinity across the top tags) — used
    // to shift leg weight toward FTS early and toward tags once the profile has real
    // signal. Summed *score*, not tag count: a dozen barely-above-MIN_SCORE tags (e.g.
    // straight out of the impression-miss decay path) shouldn't read as "mature" just
    // because a slot is filled — richness should track how much evidence backs the
    // profile, not how many keys happen to exist in the map. The denominator is the
    // actual tag count (already capped at TOP_N_TAGS by topTagsFrom), not a fixed top-tag cap;
    // otherwise genuine high confidence on fewer tags is structurally capped at
    // (tag count)/TOP_N_TAGS of its true richness, undercounting the clearest signal we produce.
    const richness = computed(() => computeRichness(decayedAffinity.value, tags.value));

    const content = useContentQuery(
        // No tags yet → a provably-empty `$in: []` so HybridQuery short-circuits
        // (no scan, no API call). Saved highlight FTS can still independently warm the feed.
        () =>
            tagSet.value.length
                ? [{ parentTags: { $elemMatch: { $in: tagSet.value } } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "recommended", limit: retrievalLimit },
    );

    // A deliberately small newest-first pool for the one exploration slot. Keep the homepage
    // visibility exclusions aligned with HomePageNewest: pages and category tag docs are not
    // content people should discover here, and hidden publish dates stay hidden.
    const explorationPool = useContentQuery(
        () => [
            {
                $or: [
                    { parentPostType: { $exists: false } },
                    { parentPostType: { $ne: PostType.Page } },
                ],
            },
            {
                $or: [
                    { parentTagType: { $exists: false } },
                    { parentTagType: { $ne: TagType.Category } },
                ],
            },
            { parentPublishDateVisible: true },
        ],
        {
            sort: [{ publishDate: "desc" }],
            limit: EXPLORATION_POOL_LIMIT,
            cache: true,
            cacheId: "recommended-exploration-pool",
        },
    );

    // Resolve the top tags' own titles (for FTS query synthesis). `useContentQuery`'s
    // default language-priority filter already collapses this to ~one doc per tag id.
    const tagContent = useContentQuery(
        () =>
            tagSet.value.length
                ? [{ parentType: DocType.Tag }, { parentId: { $in: tagSet.value } }]
                : [{ _id: { $in: [] } }],
        { cache: true, cacheId: "recommended-tag-titles", limit: TOP_N_TAGS * 2 },
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

    // Exploration candidates draw from a separate query, so resolve their topic tags
    // independently rather than assuming the tag-leg candidate set covers them.
    const explorationTopicTagIds = ref<Set<Uuid> | undefined>(undefined);
    let explorationTopicTagIdsRunSeq = 0;
    watch(
        explorationPool,
        async (docs) => {
            const runSeq = ++explorationTopicTagIdsRunSeq;
            const candidateTagIds = new Set<Uuid>();
            for (const doc of docs) for (const t of doc.parentTags ?? []) candidateTagIds.add(t);
            const ids = [...candidateTagIds];
            explorationTopicTagIds.value = undefined;
            try {
                const topicIds = await filterTopicTagIds(ids);
                // Like the tag-leg resolution above, only the newest asynchronous run may
                // commit its result; a stale pool must not classify a newer one.
                if (runSeq !== explorationTopicTagIdsRunSeq) return;
                explorationTopicTagIds.value = new Set(topicIds);
            } catch {
                // Do not briefly treat every tag as eligible if this specific resolution
                // fails. Exploration is optional, so wait for a resolved topic set instead.
                if (runSeq === explorationTopicTagIdsRunSeq) explorationTopicTagIds.value = undefined;
            }
        },
        { immediate: true },
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

    // Search the strongest topics independently so each vocabulary gets its own trigram
    // budget, then add a fixed, modest total highlight budget split across saved excerpts.
    const ftsQueries = computed(() => {
        const topTagId = tags.value[0];
        const topAffinity = (topTagId && decayedAffinity.value[topTagId]) || 1;
        const tagQueries = tags.value.slice(0, MAX_FTS_TAGS).flatMap((tagId, index) => {
            const rank = index + 1;
            const title = tagContent.value.find((t) => t.parentId === tagId)?.title;
            return title
                ? [
                      {
                          query: title,
                          weight:
                              ((decayedAffinity.value[tagId] ?? 0) / topAffinity) *
                              tierWeightForRank(rank),
                      },
                  ]
                : [];
        });
        const highlightWeight = savedHighlightQueries.value.length
            ? HIGHLIGHT_FTS_TOTAL_WEIGHT / savedHighlightQueries.value.length
            : 0;
        return [
            ...tagQueries,
            ...savedHighlightQueries.value.map(({ query }) => ({
                query,
                weight: highlightWeight,
            })),
        ];
    });

    // ftsSearch is async and local-only (offline IndexedDB, same engine as the search
    // page) — run it in a watcher into a plain ref rather than forcing the whole
    // composable's reactivity through an async computed.
    const ftsResults = ref<FtsSearchResult[]>([]);
    let ftsRunSeq = 0;
    let ftsDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFtsSignature: string | undefined;
    watch(
        ftsQueries,
        (queries) => {
            // The computed rebuilds its array when upstream refs re-evaluate; only restart
            // retrieval when the query values themselves have meaningfully changed.
            const signature = JSON.stringify(
                queries.map(({ query, weight }) => [query, weight.toFixed(4)]),
            );
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
                                appSyncedDisplayLanguageIdsAsRef.value.map((languageId) =>
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

    const seenIds = computed(() => {
        void seenVersion.value; // reactive dependency: getSeenArticleIds itself reads localStorage
        return new Set(getSeenArticleIds());
    });

    const explorationCandidate = computed(() => {
        // Unlike the tag leg, this pool is only useful after its own tags have been resolved.
        // While that async work is in flight, leave the personalized feed at its full size.
        const resolvedTopicTagIds = explorationTopicTagIds.value;
        if (resolvedTopicTagIds === undefined) return undefined;

        const topTagIds = new Set(tagSet.value);
        const tagLegCandidateIds = new Set(content.value.map((doc) => doc._id));
        return explorationPool.value.find(
            (doc) =>
                !seenIds.value.has(doc._id) &&
                !tagLegCandidateIds.has(doc._id) &&
                (doc.parentTags ?? []).some(
                    (tagId) => resolvedTopicTagIds.has(tagId) && !topTagIds.has(tagId),
                ),
        );
    });

    // Keep the decision to append a candidate and the id used by the UI as one atomic
    // computation. In particular, a parent-id collision must not leave a stale badge on a
    // personalized tile when the exploration item was intentionally skipped.
    const recommendationResult = computed(() => {
        const candidate = explorationCandidate.value;
        // Filter seen content out *before* ranking/diversity-capping, not after — otherwise
        // already-seen docs still consume slots in the per-tag MMR cap and push unseen
        // content into overflow (and past `slice(0, limit)` entirely).
        const unseenTagCandidates = content.value.filter((c) => !seenIds.value.has(c._id));
        const unseenFtsCandidates = ftsResults.value.filter((r) => !seenIds.value.has(r.docId));
        const tagRanks = new Map(tags.value.map((id, index) => [id, index + 1]));
        const personalized = rank(unseenTagCandidates, unseenFtsCandidates, decayedAffinity.value, {
            topicTagIds: topicTagIds.value,
            tagRanks,
            tagWeight: TAG_LEG_WEIGHT * (0.3 + 0.7 * richness.value),
            ftsWeight: FTS_LEG_WEIGHT * (1 - 0.5 * richness.value),
            // No candidate means this remains exactly the prior full-limit ranking path.
            limit: candidate ? Math.max(0, limit - EXPLORATION_SLOT_COUNT) : limit,
        });

        if (!candidate) return { docs: personalized, explorationId: undefined };

        // Distinct translations can have different tags, so the otherwise-disjoint query legs
        // may still refer to the same parent. Preserve one representation only.
        if (personalized.some((doc) => doc.parentId === candidate.parentId)) {
            return { docs: personalized, explorationId: undefined };
        }

        return { docs: [...personalized, candidate], explorationId: candidate._id };
    });

    const recommended = computed(() => recommendationResult.value.docs);
    const explorationId = computed(() => recommendationResult.value.explorationId);

    return { recommended, hasTags: computed(() => tags.value.length > 0), explorationId };
}

/** Profile signal strength across its selected tags. Exported for unit testing. */
export function computeRichness(decayedAffinity: AffinityMap, tags: Uuid[]): number {
    if (!tags.length) return 0;
    const total = tags.reduce((sum, id) => sum + (decayedAffinity[id] ?? 0), 0);
    return Math.min(1, total / tags.length);
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

export type RankOptions = {
    /** Restrict tag-affinity scoring/diversity to these tag ids (TagType.Topic only).
     *  Omitted (e.g. in unit tests without a live `db`) falls back to every parentTags
     *  entry, matching the previous unfiltered behaviour. */
    topicTagIds?: Set<Uuid>;
    /** 1-indexed ranks for the currently selected retrieval tags. Omitted keeps raw affinity. */
    tagRanks?: Map<Uuid, number>;
    tagWeight?: number;
    /** Additive personalization nudge for every candidate, regardless of retrieval leg.
     * Unlike tagWeight, this is not limited to tag-membership candidates. useMoreLikeThis uses it
     * for a small related-content taste signal; omitting it adds no score. */
    alignmentWeight?: number;
    ftsWeight?: number;
    now?: number;
    /** Stop diversity work once this many selected documents are determined. */
    limit?: number;
};

/**
 * Fuse the tag-membership leg and the FTS leg into one ranked list.
 *
 * The tag leg already produces a calibrated 0-1 affinity score, so it's added directly
 * (scaled by `tagWeight`) rather than collapsed into a rank position — RRF would compress
 * a 45x true gap in affinity into a ~4x gap in rank weight over a 1000-doc pool. The FTS/
 * BM25 leg isn't on a comparable scale, so it still goes through Reciprocal Rank Fusion.
 * A mild recency prior breaks ties between equally-tagged docs, and an MMR-lite cap keeps
 * a single dominant tag from filling the whole list. Exported for unit testing.
 */
export function rank(
    tagCandidates: ContentDto[],
    ftsCandidates: FtsSearchResult[],
    affinity: AffinityMap,
    options: RankOptions = {},
): ContentDto[] {
    const {
        topicTagIds,
        tagRanks,
        tagWeight = TAG_LEG_WEIGHT,
        alignmentWeight = 0,
        ftsWeight = FTS_LEG_WEIGHT,
        now = Date.now(),
        limit,
    } = options;

    const docs = new Map<Uuid, ContentDto>();
    const score = new Map<Uuid, number>();
    const parentIdToId = new Map<Uuid, Uuid>();

    const tagCandidateIds = new Set(tagCandidates.map((doc) => doc._id));
    for (const doc of tagCandidates) {
        docs.set(doc._id, doc);
        parentIdToId.set(doc.parentId, doc._id);
    }

    ftsCandidates.forEach((result, i) => {
        const ownerId = parentIdToId.get(result.doc.parentId) ?? result.docId;
        if (!docs.has(ownerId)) {
            docs.set(result.docId, result.doc);
            parentIdToId.set(result.doc.parentId, result.docId);
        }
        // Normalized to [0,1] (top rank ≈ 1, decaying with i) so the leg's full weight is
        // reachable at the top of the list — raw `1/(RRF_K+i+1)` tops out around 0.016,
        // roughly 10x smaller than RECENCY_WEIGHT, which made publish date dominate BM25
        // rank instead of merely breaking ties.
        score.set(
            ownerId,
            (score.get(ownerId) ?? 0) + ftsWeight * ((RRF_K + 1) / (RRF_K + i + 1)),
        );
    });

    const dominantTags = new Map<Uuid, Uuid | undefined>();
    for (const doc of docs.values()) {
        const { score: affinityScore, dominantTag } = tagAffinity(
            doc,
            affinity,
            topicTagIds,
            tagRanks,
        );
        dominantTags.set(doc._id, dominantTag);
        if (tagCandidateIds.has(doc._id))
            score.set(doc._id, (score.get(doc._id) ?? 0) + tagWeight * affinityScore);
        if (alignmentWeight)
            score.set(doc._id, (score.get(doc._id) ?? 0) + alignmentWeight * affinityScore);
        score.set(
            doc._id,
            (score.get(doc._id) ?? 0) + RECENCY_WEIGHT * (recencyFactor(doc, now) - 0.5),
        );
    }

    const ordered = [...docs.values()].sort(
        (a, b) => (score.get(b._id) ?? 0) - (score.get(a._id) ?? 0),
    );

    const perTagCount = new Map<Uuid, number>();
    const selected: ContentDto[] = [];
    const overflow: ContentDto[] = [];
    for (const doc of ordered) {
        const dominant = dominantTags.get(doc._id);
        if (dominant) {
            const count = perTagCount.get(dominant) ?? 0;
            if (count >= MAX_PER_DOMINANT_TAG) {
                overflow.push(doc);
                continue;
            }
            perTagCount.set(dominant, count + 1);
        }
        selected.push(doc);
        if (limit !== undefined && selected.length >= limit) break;
    }
    // The early break above only stops filling `selected` once `limit` is reached — it
    // doesn't discard whatever diversity capping already pushed into `overflow` before
    // that point, so `overflow` must still be truncated here. `slice(0, undefined)` is a
    // no-op, so the no-limit call path is unaffected.
    return [...selected, ...overflow].slice(0, limit);
}

/** Compute tag affinity and the diversity key in one allocation-free pass. */
function tagAffinity(
    doc: ContentDto,
    affinity: AffinityMap,
    topicTagIds?: Set<Uuid>,
    tagRanks?: Map<Uuid, number>,
): { score: number; dominantTag: Uuid | undefined } {
    let count = 0;
    let total = 0;
    let max = 0;
    let dominantTag: Uuid | undefined;
    for (const tag of doc.parentTags ?? []) {
        if (topicTagIds && !topicTagIds.has(tag)) continue;
        const rank = tagRanks?.get(tag);
        const value = (affinity[tag] ?? 0) * (rank === undefined ? 1 : tierWeightForRank(rank));
        count++;
        total += value;
        if (value > max) {
            max = value;
            dominantTag = tag;
        }
    }
    return { score: count ? 0.5 * max + 0.5 * (total / count) : 0, dominantTag };
}

/** Exponential recency factor, halving every `RECENCY_HALFLIFE_DAYS`, then centered by
 *  the caller around the [0,1] midpoint. Docs without a `publishDate` remain neutral. */
function recencyFactor(doc: ContentDto, now: number): number {
    if (!doc.publishDate) return 0.5;
    const ageDays = Math.max(0, (now - doc.publishDate) / DAY_MS);
    return Math.exp((-Math.LN2 / RECENCY_HALFLIFE_DAYS) * ageDays);
}
