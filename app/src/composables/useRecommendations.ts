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
    affinityConfig,
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

const TOP_N_TAGS = 12;
/** Bounds the per-language search multiplier for the FTS/serendipity leg. */
const MAX_FTS_TAGS = 4;
/** Highlight text is a deliberate but supplementary discovery signal: its entire
 * contribution stays below a single strongest topic-title query. */
const HIGHLIGHT_FTS_TOTAL_WEIGHT = 0.3;
/** Output cap on the fused feed. */
const DEFAULT_LIMIT = 20;
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
};

export function useRecommendations({
    limit = DEFAULT_LIMIT,
    retrievalLimit = DEFAULT_RETRIEVAL_LIMIT,
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
    // 0 (cold: no real signal yet) .. 1 (well-earned affinity across the top tags) — used
    // to shift leg weight toward FTS early and toward tags once the profile has real
    // signal. Summed *score*, not tag count: a dozen barely-above-MIN_SCORE tags (e.g.
    // straight out of the impression-miss decay path) shouldn't read as "mature" just
    // because a slot is filled — richness should track how much evidence backs the
    // profile, not how many keys happen to exist in the map. The denominator is the
    // actual tag count (already capped at TOP_N_TAGS by topTagsFrom), not a fixed 12;
    // otherwise genuine high confidence on fewer tags is structurally capped at
    // (tag count)/12 of its true richness, undercounting the clearest signal we produce.
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
        const tagQueries = tags.value.slice(0, MAX_FTS_TAGS).flatMap((tagId) => {
            const title = tagContent.value.find((t) => t.parentId === tagId)?.title;
            return title
                ? [{ query: title, weight: (decayedAffinity.value[tagId] ?? 0) / topAffinity }]
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
            limit,
        });
    });

    return { recommended, hasTags: computed(() => tags.value.length > 0) };
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
    tagWeight?: number;
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
        tagWeight = TAG_LEG_WEIGHT,
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
        const { score: affinityScore, dominantTag } = tagAffinity(doc, affinity, topicTagIds);
        dominantTags.set(doc._id, dominantTag);
        if (tagCandidateIds.has(doc._id))
            score.set(doc._id, (score.get(doc._id) ?? 0) + tagWeight * affinityScore);
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
): { score: number; dominantTag: Uuid | undefined } {
    let count = 0;
    let total = 0;
    let max = 0;
    let dominantTag: Uuid | undefined;
    for (const tag of doc.parentTags ?? []) {
        if (topicTagIds && !topicTagIds.has(tag)) continue;
        const value = affinity[tag] ?? 0;
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
