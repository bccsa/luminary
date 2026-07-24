import type { AffinityMap, Uuid } from "../types";

/**
 * Client-authoritative affinity scoring for recommendations.
 *
 * Pure functions over an {@link AffinityProfile} (a plain tag-id → score map
 * plus a decay timestamp). No I/O — the caller owns persistence (localStorage
 * for the working copy; the server copy is delivered/queued elsewhere). The
 * server never runs these; it only stores and restores the profile.
 */

/**
 * Fixed `_id` of the singleton {@link DefaultAffinityDto} (the CMS-managed
 * cold-start baseline). Mirrored on the API side.
 */
export const DEFAULT_AFFINITY_ID = "default-affinity";

export type AffinityProfile = {
    affinity: AffinityMap;
    /** epoch ms of the last decay application. */
    lastDecayUtc?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * CMS-configurable tuning knobs for the affinity engine. Every field here was
 * previously a module-private constant; a `config` argument (defaulting to
 * {@link DEFAULT_AFFINITY_CONFIG}) is threaded through the functions below so they
 * stay pure — no reactive/global reads inside this file. Callers that need the
 * CMS-edited values read them from the `affinityConfig` ref (`socket/socketio.ts`)
 * and pass it in explicitly.
 */
export type AffinityConfig = {
    /** Days for a score to halve under exponential decay. */
    halfLifeDays: number;
    /**
     * Fraction of the remaining confidence added by a low-confidence interaction
     * (the "Open" event weight). This deliberately makes an ordinary open a weak
     * signal: a profile should be built from a pattern of behaviour, not a handful
     * of clicks.
     */
    hitWeight: number;
    /** Scores below this are pruned as negligible. */
    minScore: number;
    /** Cap on tags kept in a profile (drop the weakest); bounds the doc size. */
    maxTags: number;
    /**
     * Depth damping: event weight is multiplied by `depthScale / (depthScale + topicCount)`.
     * A near-empty profile (few tracked topics) moves at full weight so it can bootstrap
     * quickly; a broad, established profile (many topics already carry evidence) moves
     * proportionally less per single event.
     */
    depthScale: number;
    /** Reading depth (0-100) below which a read is "opened and abandoned" — no evidence. */
    readFloorPercent: number;
    /** Shared vocabulary for interaction strength — see {@link EventWeight}. */
    eventWeight: {
        /** The user explicitly bookmarked the content. Strong, unambiguous intent. */
        bookmark: number;
        /**
         * Reverses 60% of a bookmark signal, leaving a small net-positive edge through
         * repeated add/remove churn. Undoing an explicit action is weaker evidence against
         * a tag than the original action was evidence for it.
         */
        bookmarkRemoved: number;
        /** A video/audio track played to completion. Strong engagement signal. */
        completion: number;
        /**
         * An article was read to completion (see `readingDepthWeight`). Symmetric with
         * `completion` — finishing an article is as strong a signal as finishing a
         * video/audio track.
         */
        readCompletion: number;
        /**
         * The user highlighted a passage of text. Kept as its own named weight (not
         * reused from `bookmark`) so the two can be tuned independently.
         */
        highlight: number;
        /** Reverses 60% of a highlight signal — mirrors `bookmarkRemoved`. */
        highlightRemoved: number;
        /**
         * A recommended tag was shown to the user and scrolled past without a click.
         * The cheapest, most abundant negative signal available.
         */
        impression: number;
    };
};

/** Current hard-coded values, preserved as the default so existing behaviour is unchanged. */
export const DEFAULT_AFFINITY_CONFIG: AffinityConfig = {
    halfLifeDays: 45,
    hitWeight: 0.04,
    minScore: 0.01,
    maxTags: 50,
    depthScale: 20,
    readFloorPercent: 20,
    eventWeight: {
        bookmark: 0.25,
        bookmarkRemoved: -0.15,
        completion: 0.35,
        readCompletion: 0.35,
        highlight: 0.3,
        highlightRemoved: -0.18,
        impression: -0.02,
    },
};

/**
 * Shared vocabulary for interaction strength, so every call site agrees on relative
 * weight instead of picking its own number. `Open` is the implicit default in
 * {@link applyEvent}. Explicit intent (bookmarking) and completion (finishing a
 * video/audio track) are stronger, less ambiguous signals than merely opening a
 * page — the user might have opened it and immediately left.
 *
 * These mirror {@link DEFAULT_AFFINITY_CONFIG} for callers that only need a static
 * default (e.g. tests). Call sites that should honour a CMS-edited config read
 * `affinityConfig.value.eventWeight.*` instead (see `socket/socketio.ts`).
 */
export const EventWeight = {
    /** Content was opened/viewed. Weak signal — could be an immediate bounce. */
    Open: DEFAULT_AFFINITY_CONFIG.hitWeight,
    /** The user explicitly bookmarked the content. Strong, unambiguous intent. */
    Bookmark: DEFAULT_AFFINITY_CONFIG.eventWeight.bookmark,
    /**
     * Reverses 60% of a bookmark signal, leaving a small net-positive edge through
     * repeated add/remove churn. Undoing an explicit action is weaker evidence against
     * a tag than the original action was evidence for it. Uses the same negative-weight
     * decay-toward-zero mechanism as `Impression`, not a literal inverse of the specific
     * gain contributed by the original bookmark. Derived as -60% × 0.25 = -0.15.
     */
    BookmarkRemoved: DEFAULT_AFFINITY_CONFIG.eventWeight.bookmarkRemoved,
    /** A video/audio track played to completion. Strong engagement signal. */
    Completion: DEFAULT_AFFINITY_CONFIG.eventWeight.completion,
    /**
     * An article was read to completion (see the reading-depth weight curve in
     * `readingDepthWeight`). Symmetric with `Completion` — finishing an article is
     * as strong a signal as finishing a video/audio track.
     */
    ReadCompletion: DEFAULT_AFFINITY_CONFIG.eventWeight.readCompletion,
    /**
     * The user highlighted a passage of text. Selecting specific text requires
     * closer engagement than a single tap (bookmark) — an equally strong,
     * unambiguous signal. Kept as its own named weight (not reused from
     * `Bookmark`) so the two can be tuned independently later.
     */
    Highlight: DEFAULT_AFFINITY_CONFIG.eventWeight.highlight,
    /**
     * Reverses 60% of a highlight signal, leaving a small net-positive edge through
     * repeated add/remove churn. Undoing an explicit action is weaker evidence against
     * a tag than the original action was evidence for it. Uses the same negative-weight
     * decay-toward-zero mechanism as `Impression`, not a literal inverse of the specific
     * gain contributed by the original highlight. Derived as -60% × 0.3 = -0.18.
     */
    HighlightRemoved: DEFAULT_AFFINITY_CONFIG.eventWeight.highlightRemoved,
    /**
     * A recommended tag was shown to the user and scrolled past without a click. The
     * cheapest, most abundant negative signal available — without it, a tag that got
     * one accidental bookmark keeps polluting retrieval for a full decay half-life.
     * Small and negative: many impressions are needed to meaningfully suppress a tag,
     * so a single scroll-past can't outweigh a real interaction.
     */
    Impression: DEFAULT_AFFINITY_CONFIG.eventWeight.impression,
} as const;

const empty = (): AffinityProfile => ({ affinity: {}, lastDecayUtc: undefined });

/** Apply exponential time decay to every score based on elapsed time since `lastDecayUtc`. */
export function decay(
    profile: AffinityProfile | undefined,
    now: number,
    config: AffinityConfig = DEFAULT_AFFINITY_CONFIG,
): AffinityProfile {
    const p = profile ?? empty();
    const last = p.lastDecayUtc ?? now;
    const elapsedDays = Math.max(0, now - last) / DAY_MS;
    if (elapsedDays === 0) return { affinity: { ...p.affinity }, lastDecayUtc: now };
    const factor = Math.exp((-Math.LN2 / config.halfLifeDays) * elapsedDays);
    const next: AffinityMap = {};
    for (const [tag, score] of Object.entries(p.affinity)) {
        const decayed = score * factor;
        if (decayed >= config.minScore) next[tag] = decayed;
    }
    return { affinity: next, lastDecayUtc: now };
}

/**
 * Record an interaction with `tagIds`: decay first, then add `weight` of each tag's
 * remaining headroom — see {@link EventWeight} for the shared scale. Defaults to the
 * weakest signal (a plain open) so existing callers are unaffected.
 */
export function applyEvent(
    profile: AffinityProfile | undefined,
    tagIds: Uuid[],
    now: number,
    weight: number = EventWeight.Open,
    config: AffinityConfig = DEFAULT_AFFINITY_CONFIG,
): AffinityProfile {
    const decayed = decay(profile, now, config);
    const affinity = decayed.affinity;
    // Depth damping uses the topic count *before* this event, so a profile's own
    // breadth — not this event's tags — decides how strongly it can still move.
    const depthFactor = config.depthScale / (config.depthScale + Object.keys(affinity).length);
    const newTags = new Set<Uuid>();
    for (const tag of tagIds) {
        if (!tag) continue;
        const hasPriorEvidence = tag in affinity;
        // A negative signal on a tag the profile has no evidence for carries no
        // information — there's nothing to suppress yet. Without this guard it would
        // create a zero-score entry that `capTags` then treats as a brand-new interest
        // and protects from eviction, letting a single batch of impression misses evict
        // real, learned interests from a mature profile.
        if (!hasPriorEvidence && weight < 0) continue;
        const current = affinity[tag] ?? 0;
        // A tag with no prior evidence isn't part of the "breadth" depth damping is meant
        // to protect against — it moves at full weight so it can seed a real score instead
        // of landing just above config.minScore and getting capped away on the same tick it's born.
        const factor = hasPriorEvidence ? depthFactor : 1;
        if (!hasPriorEvidence) newTags.add(tag);
        if (weight >= 0) {
            // Diminishing returns: each event closes a fraction (`weight`, damped by profile
            // depth) of the remaining gap to 1, so repeat casual opens can't saturate a tag
            // as fast as one bookmark — score growth naturally slows as confidence in a tag
            // rises, and further slows as the overall profile matures.
            affinity[tag] = current + weight * factor * (1 - current);
        } else {
            // Negative signal (e.g. EventWeight.Impression): close a fraction of the
            // remaining gap to 0 instead, so a tag can never go negative and a strong,
            // well-earned score isn't wiped out by a handful of scroll-pasts.
            affinity[tag] = current + weight * factor * current;
        }
    }
    return { affinity: capTags(affinity, config.maxTags, newTags), lastDecayUtc: now };
}

/**
 * Map final reading depth (0-100, from the reading-progress tracker) to an affinity
 * event weight. Below `config.readFloorPercent`, evidence is too ambiguous to score
 * (interrupted vs. genuinely uninterested look identical) so the weight is exactly 0 —
 * this must NOT be treated as a negative signal. From the floor to 100%, weight
 * interpolates linearly from `config.hitWeight` up to `config.eventWeight.readCompletion`,
 * so a bare-minimum qualifying read is barely stronger than an ordinary open, and only a
 * full read earns completion parity with a finished video/audio track.
 */
export function readingDepthWeight(
    depthPercent: number,
    config: AffinityConfig = DEFAULT_AFFINITY_CONFIG,
): number {
    if (depthPercent < config.readFloorPercent) return 0;
    const t = Math.min(1, (depthPercent - config.readFloorPercent) / (100 - config.readFloorPercent));
    return config.hitWeight + t * (config.eventWeight.readCompletion - config.hitWeight);
}

/** Top-`n` tag ids by (decayed) score, descending — the retrieval query seed. */
export function topTags(profile: AffinityProfile | undefined, n: number, now = Date.now()): Uuid[] {
    return topTagsFrom(decay(profile, now).affinity, n);
}

/** Top-`n` tag ids from an affinity map that has already been decayed by the caller. */
export function topTagsFrom(affinity: AffinityMap, n: number): Uuid[] {
    return Object.entries(affinity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([tag]) => tag);
}

/**
 * Drop the weakest tags beyond `max`. Tags in `protectedTags` (this event's just-created
 * tags — see {@link applyEvent}) are exempted so a brand-new interest survives at least
 * one tick instead of being evicted the instant it's born; if there isn't room even after
 * protecting them, the weakest *unprotected* tags still go first.
 */
function capTags(affinity: AffinityMap, max: number, protectedTags?: Set<Uuid>): AffinityMap {
    const entries = Object.entries(affinity);
    if (entries.length <= max) return affinity;
    entries.sort((a, b) => b[1] - a[1]);
    if (!protectedTags?.size) return Object.fromEntries(entries.slice(0, max));

    const protectedEntries = entries.filter(([tag]) => protectedTags.has(tag));
    const rest = entries.filter(([tag]) => !protectedTags.has(tag));
    const keep = Math.max(0, max - protectedEntries.length);
    return Object.fromEntries([...protectedEntries, ...rest.slice(0, keep)]);
}
