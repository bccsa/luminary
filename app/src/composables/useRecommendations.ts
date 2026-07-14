import { computed, ref, watch } from "vue";
import {
    topTags,
    ftsSearch,
    db,
    DocType,
    PublishStatus,
    TagType,
    type AffinityMap,
    type ContentDto,
    type TagDto,
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
 *  swings far down either list without needing per-source score normalization). Used
 *  only for the FTS/BM25 leg now — the tag leg contributes a calibrated score directly. */
const RRF_K = 60;
/** Base leg weights, scaled by profile richness (see `richness` below): a cold profile
 *  (few learned topics) leans on the FTS/serendipity leg; a rich one leans on tags. */
const TAG_LEG_WEIGHT = 1.5;
const FTS_LEG_WEIGHT = 1;
/** A mild prior so two equally-tagged docs don't tie and fall back to insertion order —
 *  small relative to the leg weights so it nudges, not dominates. */
const RECENCY_WEIGHT = 0.15;
const RECENCY_HALFLIFE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
/** MMR-lite diversification: caps how many docs sharing the same dominant tag can land
 *  in the ranked list before the rest of that tag's matches get pushed down. Without
 *  this the top of the feed is whichever single tag scores highest. */
const MAX_PER_DOMINANT_TAG = 3;

/**
 * Personalized "Recommended for you" feed.
 *
 * Reads the local affinity profile → top tags, then retrieves via TWO independent legs:
 *  - **Tag membership**: a Mango `parentTags` query over the SAME hybridQuery path every
 *    feed uses, scored by the doc's own tag-affinity (a calibrated 0-1 value, contributed
 *    directly rather than collapsed to a rank).
 *  - **BM25/FTS**: the top tags' own titles synthesized into a query string (weighted
 *    toward the highest-affinity tags) and run through the existing local full-text
 *    search (`ftsSearch`, offline, same engine as the search page), across the full
 *    display-language priority chain — surfaces content that matches the user's
 *    interests by vocabulary even when it isn't literally tagged with one of the top
 *    tags (the "serendipity" leg). Fused with the tag leg via RRF since BM25 scores
 *    aren't calibrated against the tag leg's affinity scale.
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
    // 0 (cold: no real signal yet) .. 1 (TOP_N_TAGS worth of well-earned affinity) — used
    // to shift leg weight toward FTS early and toward tags once the profile has real
    // signal. Summed *score*, not tag count: a dozen barely-above-MIN_SCORE tags (e.g.
    // straight out of the impression-miss decay path) shouldn't read as "mature" just
    // because a slot is filled — richness should track how much evidence backs the
    // profile, not how many keys happen to exist in the map.
    const richness = computed(() => {
        const total = tags.value.reduce((sum, id) => sum + (affinityProfile.value.affinity[id] ?? 0), 0);
        return Math.min(1, total / TOP_N_TAGS);
    });

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

    // Which of the candidates' `parentTags` are actually TagType.Topic (categories and
    // audio playlists sit on most of the corpus and must not count toward tag-affinity
    // scoring or diversity — same restriction `recordAffinity` already applies on write).
    const topicTagIds = ref<Set<Uuid>>(new Set());
    let topicTagIdsRunSeq = 0;
    watch(
        content,
        async (docs) => {
            const runSeq = ++topicTagIdsRunSeq;
            const candidateTagIds = new Set<Uuid>();
            for (const doc of docs) for (const t of doc.parentTags ?? []) candidateTagIds.add(t);
            const ids = [...candidateTagIds];
            try {
                // A single bulk IDB read instead of one `isTagType` transaction per distinct
                // tag (up to 1000-doc-pool-worth every `content` change).
                const tagDocs = await db.docs.bulkGet(ids);
                // `content` can change again before this resolves; only the most recent run
                // may commit, otherwise an older, slower run can overwrite a newer result.
                if (runSeq !== topicTagIdsRunSeq) return;
                const next = new Set<Uuid>();
                tagDocs.forEach((doc, i) => {
                    if (doc?.type === DocType.Tag && (doc as TagDto).tagType === TagType.Topic)
                        next.add(ids[i]);
                });
                topicTagIds.value = next;
            } catch {
                // db not initialized (e.g. unit tests) — leave the previous value.
            }
        },
        { immediate: true },
    );

    // Weight each tag's title contribution to the FTS query by its rank (tags.value is
    // already affinity-sorted descending) so the #1 interest doesn't share equal BM25
    // vocabulary weight with the #12 — repeating the title increases its term frequency.
    const ftsQuery = computed(() =>
        tags.value
            .map((id, i) => {
                const title = tagContent.value.find((t) => t.parentId === id)?.title;
                if (!title) return "";
                const repeats = Math.max(1, Math.round((TOP_N_TAGS - i) / 3));
                return Array(repeats).fill(title).join(" ");
            })
            .filter((t) => !!t)
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
                // Full display-language priority chain, not just the first language, so a
                // profile whose top tags have thin content in the primary language still
                // gets a serendipity leg — mirrors the tag leg's own language fallback.
                const seen = new Set<Uuid>();
                const merged: FtsSearchResult[] = [];
                for (const languageId of appDisplayLanguageIdsAsRef.value) {
                    if (merged.length >= retrievalLimit) break;
                    const results = await ftsSearch({
                        query,
                        languageId,
                        status: PublishStatus.Published,
                        publishedBefore: now,
                        limit: retrievalLimit,
                    });
                    for (const r of results) {
                        if (seen.has(r.docId)) continue;
                        // ftsSearch has no expiry filter — drop expired content post-hoc
                        // (parity with the tag leg's mangoIsPublished check).
                        if (r.doc.expiryDate && r.doc.expiryDate < now) continue;
                        seen.add(r.docId);
                        merged.push(r);
                        if (merged.length >= retrievalLimit) break;
                    }
                }
                ftsResults.value = merged;
            } catch {
                // Offline FTS is best-effort here — a failure just means this leg
                // contributes nothing; the tag-membership leg still works.
                ftsResults.value = [];
            }
        },
        { immediate: true },
    );

    const seenIds = computed(() => {
        void seenVersion.value; // reactive dependency: getSeenContentIds itself reads localStorage
        return new Set(getSeenContentIds());
    });

    const recommended = computed(() => {
        // Filter seen content out *before* ranking/diversity-capping, not after — otherwise
        // already-seen docs still consume slots in the per-tag MMR cap and push unseen
        // content into overflow (and past `slice(0, limit)` entirely).
        const unseenTagCandidates = content.value.filter((c) => !seenIds.value.has(c._id));
        const unseenFtsCandidates = ftsResults.value.filter((r) => !seenIds.value.has(r.docId));
        return rank(unseenTagCandidates, unseenFtsCandidates, affinityProfile.value.affinity, {
            topicTagIds: topicTagIds.value,
            tagWeight: TAG_LEG_WEIGHT * (0.3 + 0.7 * richness.value),
            ftsWeight: FTS_LEG_WEIGHT * (1 - 0.5 * richness.value),
        }).slice(0, limit);
    });

    return { recommended, hasTags: computed(() => tags.value.length > 0) };
}

export type RankOptions = {
    /** Restrict tag-affinity scoring/diversity to these tag ids (TagType.Topic only).
     *  Omitted (e.g. in unit tests without a live `db`) falls back to every parentTags
     *  entry, matching the previous unfiltered behaviour. */
    topicTagIds?: Set<Uuid>;
    tagWeight?: number;
    ftsWeight?: number;
    now?: number;
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
    } = options;

    const docs = new Map<Uuid, ContentDto>();
    const score = new Map<Uuid, number>();

    for (const doc of tagCandidates) {
        docs.set(doc._id, doc);
        score.set(
            doc._id,
            (score.get(doc._id) ?? 0) + tagWeight * tagScore(doc, affinity, topicTagIds),
        );
    }

    ftsCandidates.forEach((result, i) => {
        if (!docs.has(result.docId)) docs.set(result.docId, result.doc);
        // Normalized to [0,1] (top rank ≈ 1, decaying with i) so the leg's full weight is
        // reachable at the top of the list — raw `1/(RRF_K+i+1)` tops out around 0.016,
        // roughly 10x smaller than RECENCY_WEIGHT, which made publish date dominate BM25
        // rank instead of merely breaking ties.
        score.set(
            result.docId,
            (score.get(result.docId) ?? 0) + ftsWeight * ((RRF_K + 1) / (RRF_K + i + 1)),
        );
    });

    for (const doc of docs.values()) {
        score.set(doc._id, (score.get(doc._id) ?? 0) + RECENCY_WEIGHT * recencyFactor(doc, now));
    }

    const ordered = [...docs.values()].sort(
        (a, b) => (score.get(b._id) ?? 0) - (score.get(a._id) ?? 0),
    );

    const perTagCount = new Map<Uuid, number>();
    const selected: ContentDto[] = [];
    const overflow: ContentDto[] = [];
    for (const doc of ordered) {
        const dominant = dominantTag(doc, affinity, topicTagIds);
        if (dominant) {
            const count = perTagCount.get(dominant) ?? 0;
            if (count >= MAX_PER_DOMINANT_TAG) {
                overflow.push(doc);
                continue;
            }
            perTagCount.set(dominant, count + 1);
        }
        selected.push(doc);
    }
    return [...selected, ...overflow];
}

/** A doc's topic tags eligible for affinity scoring/diversity — every `parentTags`
 *  entry if `topicTagIds` wasn't resolved (unit tests), otherwise only Topic tags. */
function eligibleTags(doc: ContentDto, topicTagIds?: Set<Uuid>): Uuid[] {
    const tags = doc.parentTags ?? [];
    return topicTagIds ? tags.filter((t) => topicTagIds.has(t)) : tags;
}

/** Blend of max and mean affinity over the doc's topic tags: pure averaging over-punishes
 *  richly-tagged content (one strong topic plus several near-zero ones would otherwise
 *  lose to a single lukewarm tag), while pure max ignores that multiple matches are still
 *  a stronger signal than one. */
function tagScore(doc: ContentDto, affinity: AffinityMap, topicTagIds?: Set<Uuid>): number {
    const tags = eligibleTags(doc, topicTagIds);
    if (!tags.length) return 0;
    const scores = tags.map((t) => affinity[t] ?? 0);
    const max = Math.max(...scores);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return 0.5 * max + 0.5 * mean;
}

/** The single topic tag driving a doc's tag-affinity score, for diversity capping. */
function dominantTag(
    doc: ContentDto,
    affinity: AffinityMap,
    topicTagIds?: Set<Uuid>,
): Uuid | undefined {
    const tags = eligibleTags(doc, topicTagIds);
    if (!tags.length) return undefined;
    const best = tags.reduce((best, t) => ((affinity[t] ?? 0) > (affinity[best] ?? 0) ? t : best));
    // A doc with no affinity on any of its topic tags (typical of a pure-FTS-leg doc)
    // has no real "dominant" tag — returning tags[0] would key diversity capping off an
    // arbitrary tag instead of leaving the doc uncapped.
    return (affinity[best] ?? 0) > 0 ? best : undefined;
}

/** Exponential recency prior, halving every `RECENCY_HALFLIFE_DAYS`. Docs without a
 *  `publishDate` are neutral (0), neither boosted nor penalized. */
function recencyFactor(doc: ContentDto, now: number): number {
    if (!doc.publishDate) return 0;
    const ageDays = Math.max(0, (now - doc.publishDate) / DAY_MS);
    return Math.exp((-Math.LN2 / RECENCY_HALFLIFE_DAYS) * ageDays);
}

/** Content ids the user has already engaged with: articles marked seen via a
 *  dwell-gated open, and audio/video marked seen on completion (see `seenStore`).
 *  `mediaProgress` (globalConfig.ts) is deliberately NOT used here — it's a 10-slot
 *  ring buffer for resuming playback, and entries are removed on completion, so
 *  presence there means "abandoned partway through", not "seen". */
function getSeenContentIds(): Uuid[] {
    return getSeenArticleIds();
}
