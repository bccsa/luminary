import type { AffinityMap, Uuid } from "../types";

/**
 * Client-authoritative affinity scoring for recommendations.
 *
 * Pure functions over an {@link AffinityProfile} (a plain tag-id → score map
 * plus a decay timestamp). No I/O — the caller owns persistence (localStorage
 * for the working copy; the server copy is delivered/queued elsewhere). The
 * server never runs these; it only stores and restores the profile.
 */

/** `_id` prefix for a {@link UserAffinityDto}. Mirrored on the API side. */
export const USER_AFFINITY_ID_PREFIX = "user-affinity-";

/** Deterministic affinity-doc id for a user (= the User doc `_id`). */
export const userAffinityId = (userId: Uuid): string => `${USER_AFFINITY_ID_PREFIX}${userId}`;

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

/** Days for a score to halve under exponential decay. */
const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Score added to a tag per interaction (before clamping to 1). This is the
 * baseline weight for a low-confidence signal (opening a piece of content).
 * Callers with a stronger signal (an explicit bookmark, finishing a video/audio
 * track) should pass a higher `weight` to {@link applyEvent} — see
 * `EventWeight` for the shared vocabulary.
 */
const HIT_WEIGHT = 0.3;
/** Scores below this are pruned as negligible. */
const MIN_SCORE = 0.01;
/** Cap on tags kept in a profile (drop the weakest); bounds the doc size. */
const MAX_TAGS = 50;

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
    Bookmark: 0.6,
    /** A video/audio track played to completion. Strong engagement signal. */
    Completion: 0.6,
    /**
     * The user highlighted a passage of text. Selecting specific text requires
     * closer engagement than a single tap (bookmark) — an equally strong,
     * unambiguous signal. Kept as its own named weight (not reused from
     * `Bookmark`) so the two can be tuned independently later.
     */
    Highlight: 0.6,
} as const;

const empty = (): AffinityProfile => ({ affinity: {}, lastDecayUtc: undefined });

/** Apply exponential time decay to every score based on elapsed time since `lastDecayUtc`. */
export function decay(profile: AffinityProfile | undefined, now: number): AffinityProfile {
    const p = profile ?? empty();
    const last = p.lastDecayUtc ?? now;
    const elapsedDays = Math.max(0, now - last) / DAY_MS;
    if (elapsedDays === 0) return { affinity: { ...p.affinity }, lastDecayUtc: now };
    const factor = Math.exp((-Math.LN2 / HALF_LIFE_DAYS) * elapsedDays);
    const next: AffinityMap = {};
    for (const [tag, score] of Object.entries(p.affinity)) {
        const decayed = score * factor;
        if (decayed >= MIN_SCORE) next[tag] = decayed;
    }
    return { affinity: next, lastDecayUtc: now };
}

/**
 * Record an interaction with `tagIds`: decay first, then bump each tag (clamped to
 * 1) by `weight` — see {@link EventWeight} for the shared scale. Defaults to the
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
    for (const tag of tagIds) {
        if (!tag) continue;
        affinity[tag] = Math.min(1, (affinity[tag] ?? 0) + weight);
    }
    return { affinity: capTags(affinity, MAX_TAGS), lastDecayUtc: now };
}

/** Top-`n` tag ids by (decayed) score, descending — the retrieval query seed. */
export function topTags(profile: AffinityProfile | undefined, n: number, now = Date.now()): Uuid[] {
    return Object.entries(decay(profile, now).affinity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([tag]) => tag);
}

function capTags(affinity: AffinityMap, max: number): AffinityMap {
    const entries = Object.entries(affinity);
    if (entries.length <= max) return affinity;
    entries.sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(entries.slice(0, max));
}
