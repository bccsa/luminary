/**
 * Pure, dependency-light ranking primitives split out of `useRecommendations.ts`.
 *
 * Why this is its own module: `rank` and `affinityScoreScale` are pure functions with no
 * need for the composable's runtime graph (`ftsSearch`, `searchQueryStore`,
 * `useContentQueryWithState`, `highlightStore`, live Dexie subscriptions). Callers that only
 * re-rank an already-retrieved candidate pool — notably `RelatedContent.vue`'s "Read more"
 * feed — can import from here without dragging that heavy graph into every spec that mounts
 * them. `useRecommendations.ts` re-exports these for back-compat. Type-only shared imports
 * keep this module's runtime footprint minimal.
 */
import { type AffinityMap, type ContentDto, type FtsSearchResult, type Uuid } from "luminary-shared";

/**
 * The score scale the leg-weight constants below were calibrated against — i.e. the
 * `eventWeight.completion` value the ranking was tuned for. Ranking inputs derived from raw
 * affinity scores (richness, the tag-leg score) are normalized back to this nominal scale, so
 * rescaling the config weights changes only per-event update granularity, not ranking balance.
 * With the default config this is a no-op (`completion` already equals this anchor).
 */
export const NOMINAL_COMPLETION_WEIGHT = 0.35;

/** Best-effort RRF tuning pending offline evaluation: 10 preserves meaningful top-rank
 *  separation after normalization while still de-weighting swings farther down the list. */
export const RRF_K = 10;
/** Base leg weight for the tag-affinity leg, scaled by profile richness in the composable path. */
export const TAG_LEG_WEIGHT = 1.5;
/** Best-effort pending offline evaluation: 0.4 aligns top FTS hits with strong real tag contributions (~0.07-0.4). */
export const FTS_LEG_WEIGHT = 0.4;
/** A mild prior so two equally-scored docs don't tie and fall back to insertion order — small
 *  relative to the leg weights so it nudges, not dominates. */
export const RECENCY_WEIGHT = 0.05;
export const RECENCY_HALFLIFE_DAYS = 180;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** MMR-lite diversification: caps how many docs sharing the same dominant tag can land in the
 *  ranked list before the rest of that tag's matches get pushed down. Overridable per call
 *  (e.g. Read more relaxes it so relevance ordering isn't overridden by diversity capping). */
export const MAX_PER_DOMINANT_TAG = 3;

/**
 * Map raw affinity scores back to the nominal scale the ranking constants were calibrated for,
 * so a config weight rescale (which shrinks raw scores) leaves ranking balance invariant. No-op
 * under the default config. Exported so callers that invoke `rank` directly apply the same
 * normalization as the in-engine ranking path.
 */
export function affinityScoreScale(completionWeight: number): number {
    if (!Number.isFinite(completionWeight) || completionWeight <= 0) return 1;
    return NOMINAL_COMPLETION_WEIGHT / completionWeight;
}

export type RankOptions = {
    /** Restrict tag-affinity scoring/diversity to these tag ids (TagType.Topic only).
     *  Omitted (e.g. in unit tests without a live `db`) falls back to every parentTags
     *  entry, matching the previous unfiltered behaviour. */
    topicTagIds?: Set<Uuid>;
    tagWeight?: number;
    ftsWeight?: number;
    now?: number;
    /** Multiplier mapping raw affinity scores back to the nominal scale the leg weights were
     *  calibrated for (see {@link NOMINAL_COMPLETION_WEIGHT}). Defaults to 1 (no rescale) so
     *  unit tests are unchanged. */
    scoreScale?: number;
    /** Stop diversity work once this many selected documents are determined. */
    limit?: number;
    /** Tag ids of a "reference" article (the one being read). When set with `referenceWeight`,
     *  candidates sharing more of these tags score higher — a relevance-to-the-current-article
     *  leg used by Read more so an incidental topic tag can't promote off-theme content. */
    referenceTagIds?: Set<Uuid>;
    /** Weight per shared reference tag. Default 0 → leg inactive (HomePage/tests unchanged). */
    referenceWeight?: number;
    /** Per-dominant-tag cap override. Defaults to {@link MAX_PER_DOMINANT_TAG}. Read more passes
     *  a large value so relevance ordering isn't demoted by MMR overflow. */
    maxPerDominantTag?: number;
};

/**
 * Fuse the tag-membership leg and the FTS leg into one ranked list.
 *
 * The tag leg already produces a calibrated 0-1 affinity score, so it's added directly (scaled
 * by `tagWeight`) rather than collapsed into a rank position — RRF would compress a 45x true
 * gap in affinity into a ~4x gap in rank weight over a 1000-doc pool. The FTS/BM25 leg isn't on
 * a comparable scale, so it still goes through Reciprocal Rank Fusion. `scoreScale` maps raw
 * affinity scores back to that nominal 0-1 scale before scoring, so a config weight rescale
 * (which shrinks raw scores) leaves ranking balance invariant. A mild recency prior breaks ties
 * between equally-tagged docs, an optional reference-tag relevance leg promotes content
 * closely related to a given article, and an MMR-lite cap keeps a single dominant tag from
 * filling the whole list. Exported for unit testing.
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
        scoreScale = 1,
        limit,
        referenceTagIds,
        referenceWeight = 0,
        maxPerDominantTag = MAX_PER_DOMINANT_TAG,
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
        score.set(ownerId, (score.get(ownerId) ?? 0) + ftsWeight * ((RRF_K + 1) / (RRF_K + i + 1)));
    });

    const dominantTags = new Map<Uuid, Uuid | undefined>();
    for (const doc of docs.values()) {
        const { score: affinityScore, dominantTag } = tagAffinity(doc, affinity, topicTagIds);
        dominantTags.set(doc._id, dominantTag);
        if (tagCandidateIds.has(doc._id))
            // `scoreScale` maps the raw affinity score back to the nominal 0-1 scale the
            // `tagWeight` constants were calibrated for, so a config weight rescale (which
            // shrinks raw scores) doesn't deflate the tag leg relative to the FTS leg.
            score.set(
                doc._id,
                (score.get(doc._id) ?? 0) + tagWeight * affinityScore * scoreScale,
            );
        score.set(
            doc._id,
            (score.get(doc._id) ?? 0) + RECENCY_WEIGHT * (recencyFactor(doc, now) - 0.5),
        );
        // Reference-article relevance leg: each tag shared with the reference article adds
        // `referenceWeight`. With a weight ~1.0 this dominates recency (span 0.05) and a
        // tempered affinity nudge, banding candidates by shared-tag count so content matching
        // the article being read rises and incidental-topic items sink. Inactive by default.
        if (referenceTagIds && referenceWeight > 0) {
            let overlap = 0;
            for (const tag of doc.parentTags ?? []) if (referenceTagIds.has(tag)) overlap++;
            if (overlap > 0) score.set(doc._id, (score.get(doc._id) ?? 0) + referenceWeight * overlap);
        }
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
            if (count >= maxPerDominantTag) {
                overflow.push(doc);
                continue;
            }
            perTagCount.set(dominant, count + 1);
        }
        selected.push(doc);
        if (limit !== undefined && selected.length >= limit) break;
    }
    // The early break above only stops filling `selected` once `limit` is reached — it doesn't
    // discard whatever diversity capping already pushed into `overflow` before that point, so
    // `overflow` must still be truncated here. `slice(0, undefined)` is a no-op, so the no-limit
    // call path is unaffected.
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