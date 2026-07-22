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

/** Days for a score to halve under exponential decay outside the top-ten rank tiers. */
const HALF_LIFE_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Resolve a 1-indexed profile rank into one shared tier boundary. The tiers and their
 * starting values were simulation-validated, but remain open to future tuning.
 */
function tierForRank(rank: number): "core" | "strong" | "established" | "unprotected" {
    if (rank <= 3) return "core";
    if (rank <= 5) return "strong";
    if (rank <= 10) return "established";
    return "unprotected";
}

/**
 * Simulation-validated starting half-lives, in days, by the profile rank tier. These
 * intentionally remain separate from retrieval weights because their units and tuning
 * goals differ, while `tierForRank` keeps their boundaries in sync.
 */
const TIER_HALF_LIFE_DAYS: Record<ReturnType<typeof tierForRank>, number> = {
    core: 120,
    strong: 60,
    established: 25,
    unprotected: HALF_LIFE_DAYS,
};

/**
 * Simulation-validated starting retrieval multipliers by the profile rank tier. These
 * are independent from decay half-lives and remain open to future tuning; the
 * `unprotected` value is a fallback because retrieval normally selects only the top ten.
 */
const TIER_WEIGHT: Record<ReturnType<typeof tierForRank>, number> = {
    core: 1.0,
    strong: 0.6,
    established: 0.3,
    unprotected: 0.3,
};

/**
 * Tier-based retrieval weight multiplier for a tag at this rank (1-indexed, rank 1 =
 * highest-scoring tag in the profile). Shares rank-tier boundaries with decay's half-life
 * table so the two cannot drift apart on where a tier starts or ends, despite using
 * independent scales.
 */
export function tierWeightForRank(rank: number): number {
    return TIER_WEIGHT[tierForRank(rank)];
}
/**
 * Fraction of the remaining confidence added by a low-confidence interaction.
 * This deliberately makes an ordinary open a weak signal: a profile should be
 * built from a pattern of behaviour, not a handful of clicks.
 * Callers with a stronger signal (an explicit bookmark, finishing a video/audio
 * track) should pass a higher `weight` to {@link applyEvent} — see
 * `EventWeight` for the shared vocabulary.
 */
const HIT_WEIGHT = 0.04;
/** Scores below this are pruned as negligible. */
const MIN_SCORE = 0.01;
/** Cap on tags kept in a profile (drop the weakest); bounds the doc size. */
const MAX_TAGS = 50;
/**
 * Depth damping: event weight is multiplied by `DEPTH_SCALE / (DEPTH_SCALE + topicCount)`.
 * A near-empty profile (few tracked topics) moves at full weight so it can bootstrap
 * quickly; a broad, established profile (many topics already carry evidence) moves
 * proportionally less per single event — one click shouldn't reshape a profile that
 * already reflects a real pattern of behaviour.
 */
const DEPTH_SCALE = 20;

/**
 * Shared vocabulary for interaction strength, so every call site agrees on relative
 * weight instead of picking its own number. `Open` is the implicit default in
 * {@link applyEvent}. Explicit intent (bookmarking) and completion (finishing a
 * video/audio track) are stronger, less ambiguous signals than merely opening a
 * page — the user might have opened it and immediately left.
 */
export const EventWeight = {
    /** Content was opened/viewed. Weak signal — could be an immediate bounce. */
    Open: HIT_WEIGHT,
    /** The user explicitly bookmarked the content. Strong, unambiguous intent. */
    Bookmark: 0.25,
    /**
     * Reverses 60% of a bookmark signal, leaving a small net-positive edge through
     * repeated add/remove churn. Undoing an explicit action is weaker evidence against
     * a tag than the original action was evidence for it. Uses the same negative-weight
     * decay-toward-zero mechanism as `Impression`, not a literal inverse of the specific
     * gain contributed by the original bookmark. Derived as -60% × 0.25 = -0.15.
     */
    BookmarkRemoved: -0.15,
    /** A video/audio track played to completion. Strong engagement signal. */
    Completion: 0.35,
    /**
     * An article was read to completion (see the reading-depth weight curve in
     * `readingDepthWeight`). Symmetric with `Completion` — finishing an article is
     * as strong a signal as finishing a video/audio track.
     */
    ReadCompletion: 0.35,
    /**
     * The user highlighted a passage of text. Selecting specific text requires
     * closer engagement than a single tap (bookmark) — an equally strong,
     * unambiguous signal. Kept as its own named weight (not reused from
     * `Bookmark`) so the two can be tuned independently later.
     */
    Highlight: 0.3,
    /**
     * Reverses 60% of a highlight signal, leaving a small net-positive edge through
     * repeated add/remove churn. Undoing an explicit action is weaker evidence against
     * a tag than the original action was evidence for it. Uses the same negative-weight
     * decay-toward-zero mechanism as `Impression`, not a literal inverse of the specific
     * gain contributed by the original highlight. Derived as -60% × 0.3 = -0.18.
     */
    HighlightRemoved: -0.18,
    /**
     * A recommended tag was shown to the user and scrolled past without a click. The
     * cheapest, most abundant negative signal available — without it, a tag that got
     * one accidental bookmark keeps polluting retrieval for a full decay half-life.
     * Small and negative: many impressions are needed to meaningfully suppress a tag,
     * so a single scroll-past can't outweigh a real interaction.
     */
    Impression: -0.02,
} as const;

const empty = (): AffinityProfile => ({ affinity: {}, lastDecayUtc: undefined });

/** Apply rank-tiered exponential time decay based on elapsed time since `lastDecayUtc`. */
export function decay(profile: AffinityProfile | undefined, now: number): AffinityProfile {
    const p = profile ?? empty();
    const last = p.lastDecayUtc ?? now;
    const elapsedDays = Math.max(0, now - last) / DAY_MS;
    if (elapsedDays === 0) return { affinity: { ...p.affinity }, lastDecayUtc: now };
    // Rank by pre-decay score so each tag's half-life reflects its standing going into
    // this pass, rather than a rank that is still changing as decay is applied.
    const ranked = Object.entries(p.affinity).sort((a, b) => b[1] - a[1]);
    const next: AffinityMap = {};
    ranked.forEach(([tag, score], index) => {
        const halfLife = TIER_HALF_LIFE_DAYS[tierForRank(index + 1)];
        const factor = Math.exp((-Math.LN2 / halfLife) * elapsedDays);
        const decayed = score * factor;
        if (decayed >= MIN_SCORE) next[tag] = decayed;
    });
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
): AffinityProfile {
    const decayed = decay(profile, now);
    const affinity = decayed.affinity;
    // Depth damping uses the topic count *before* this event, so a profile's own
    // breadth — not this event's tags — decides how strongly it can still move.
    const depthFactor = DEPTH_SCALE / (DEPTH_SCALE + Object.keys(affinity).length);
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
        // of landing just above MIN_SCORE and getting capped away on the same tick it's born.
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
    return { affinity: capTags(affinity, MAX_TAGS, newTags), lastDecayUtc: now };
}

/** Reading depth below this is "opened and abandoned" — no affinity evidence either way. */
const READ_FLOOR_PERCENT = 20;

/**
 * Map final reading depth (0-100, from the reading-progress tracker) to an affinity
 * event weight. Below the floor, evidence is too ambiguous to score (interrupted vs.
 * genuinely uninterested look identical) so the weight is exactly 0 — this must NOT be
 * treated as a negative signal. From the floor to 100%, weight interpolates linearly
 * from `EventWeight.Open` up to `EventWeight.ReadCompletion`, so a bare-minimum
 * qualifying read is barely stronger than an ordinary open, and only a full read earns
 * completion parity with a finished video/audio track.
 */
export function readingDepthWeight(depthPercent: number): number {
    if (depthPercent < READ_FLOOR_PERCENT) return 0;
    const t = Math.min(1, (depthPercent - READ_FLOOR_PERCENT) / (100 - READ_FLOOR_PERCENT));
    return EventWeight.Open + t * (EventWeight.ReadCompletion - EventWeight.Open);
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
