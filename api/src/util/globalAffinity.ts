import { Uuid } from "../enums";
import { GlobalAffinityConfigDto } from "../dto/DefaultAffinityDto";

/**
 * Fixed `_id` of the singleton `GlobalAffinityDto` (the server-aggregated, audience-wide
 * profile). Mirror of shared's `GLOBAL_AFFINITY_ID` — keep in sync.
 */
export const GLOBAL_AFFINITY_ID = "global-affinity";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scale a contribution vector to unit L1 so one client contributes exactly one vote,
 * however heavily they use the app. Mirror of shared's `normalizeContribution`; applied
 * again server-side because a client's normalization is not something to take on trust.
 * Non-finite and zero entries are dropped; signs are preserved.
 */
export function normalizeContribution(
    contribution: Record<Uuid, number> | undefined,
): Record<Uuid, number> {
    let total = 0;
    const finite: [Uuid, number][] = [];
    for (const [tag, value] of Object.entries(contribution ?? {})) {
        if (!tag || typeof value !== "number" || !Number.isFinite(value) || value === 0) continue;
        finite.push([tag, value]);
        total += Math.abs(value);
    }
    if (!total) return {};
    return Object.fromEntries(finite.map(([tag, value]) => [tag, value / total]));
}

/**
 * Apply exponential time decay to a global affinity map, pruning anything that falls
 * below `minScore`. Same shape as shared's `decay`, on the global half-life.
 */
export function decayGlobalAffinity(
    affinity: Record<Uuid, number>,
    lastDecayUtc: number | undefined,
    now: number,
    config: GlobalAffinityConfigDto,
): Record<Uuid, number> {
    const elapsedDays = Math.max(0, now - (lastDecayUtc ?? now)) / DAY_MS;
    if (elapsedDays === 0) return { ...affinity };
    const factor = Math.exp((-Math.LN2 / config.halfLifeDays) * elapsedDays);
    const next: Record<Uuid, number> = {};
    for (const [tag, score] of Object.entries(affinity)) {
        const decayed = score * factor;
        if (decayed >= config.minScore) next[tag] = decayed;
    }
    return next;
}

/**
 * Fold an accumulated contribution vector into a decayed global map.
 *
 * Each unit of contribution closes `config.learningRate` of a tag's remaining gap to 1 (or
 * to 0, for a negative signal), and one client's whole contribution sums to 1 — that is what
 * bounds any individual's influence. An accumulated batch of `d` units is therefore `d`
 * applications of that step, which compounds to `1 - (1 - rate)^d` rather than `rate * d`.
 *
 * Compounding, not multiplying, is load-bearing twice over: `rate * d` exceeds 1 for a large
 * enough batch (letting a score escape [0, 1)), and it would make the result depend on how
 * many contributions happened to share a flush window. Under compounding a batch of 200 and
 * 200 separate flushes land on the same score, so the aggregate never depends on timing.
 */
export function applyGlobalContribution(
    affinity: Record<Uuid, number>,
    contribution: Record<Uuid, number>,
    config: GlobalAffinityConfigDto,
): Record<Uuid, number> {
    const next = { ...affinity };
    const rate = Math.min(1, Math.max(0, config.learningRate));

    for (const [tag, delta] of Object.entries(contribution)) {
        if (!tag || typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) continue;
        const current = next[tag] ?? 0;
        // A negative signal on a tag with no evidence yet carries no information — there is
        // nothing to suppress. Mirrors the per-user engine's guard.
        if (!next[tag] && delta < 0) continue;

        const closed = 1 - Math.pow(1 - rate, Math.abs(delta));
        next[tag] = delta > 0 ? current + closed * (1 - current) : current - closed * current;
    }
    return next;
}

/** Drop the weakest tags beyond `max` and prune anything below `minScore`. */
export function capGlobalAffinity(
    affinity: Record<Uuid, number>,
    config: GlobalAffinityConfigDto,
): Record<Uuid, number> {
    const entries = Object.entries(affinity).filter(
        ([, score]) => Number.isFinite(score) && score >= config.minScore,
    );
    if (entries.length <= config.maxTags) return Object.fromEntries(entries);
    entries.sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(entries.slice(0, config.maxTags));
}
