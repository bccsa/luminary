import { AffinityConfigDto, DefaultAffinityDto } from "../../dto/DefaultAffinityDto";
import { DEFAULT_AFFINITY_CONFIG, DEFAULT_AFFINITY_ID } from "../../util/defaultAffinity";

/** Generous ceiling on the number of tags an editor can curate into the default profile. */
const MAX_DEFAULT_TAGS = 200;

/** Clamp a number into `[min, max]`; falls back to `fallback` if not a finite number. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

/**
 * Validate/clamp a CMS-submitted `config` into safe bounds, falling back field-by-field
 * to {@link DEFAULT_AFFINITY_CONFIG} for anything missing or malformed — a partial or
 * fat-fingered edit must not corrupt the doc other tunable fields rely on, nor leave a
 * gap that crashes the affinity engine on a missing field.
 */
function normalizeConfig(config: Partial<AffinityConfigDto> | undefined): AffinityConfigDto {
    const c = config ?? {};

    return {
        halfLifeDays: clampNumber(c.halfLifeDays, 1, 3650, DEFAULT_AFFINITY_CONFIG.halfLifeDays),
        hitWeight: clampNumber(c.hitWeight, 0, 1, DEFAULT_AFFINITY_CONFIG.hitWeight),
        minScore: clampNumber(c.minScore, 0.0001, 0.5, DEFAULT_AFFINITY_CONFIG.minScore),
        maxTags: Math.round(clampNumber(c.maxTags, 1, 500, DEFAULT_AFFINITY_CONFIG.maxTags)),
        depthScale: clampNumber(c.depthScale, 1, 1000, DEFAULT_AFFINITY_CONFIG.depthScale),
        readFloorPercent: clampNumber(c.readFloorPercent, 0, 100, DEFAULT_AFFINITY_CONFIG.readFloorPercent),
        eventWeight: {
            bookmark: clampNumber(c.eventWeight?.bookmark, -1, 1, DEFAULT_AFFINITY_CONFIG.eventWeight.bookmark),
            bookmarkRemoved: clampNumber(
                c.eventWeight?.bookmarkRemoved,
                -1,
                1,
                DEFAULT_AFFINITY_CONFIG.eventWeight.bookmarkRemoved,
            ),
            completion: clampNumber(
                c.eventWeight?.completion,
                -1,
                1,
                DEFAULT_AFFINITY_CONFIG.eventWeight.completion,
            ),
            readCompletion: clampNumber(
                c.eventWeight?.readCompletion,
                -1,
                1,
                DEFAULT_AFFINITY_CONFIG.eventWeight.readCompletion,
            ),
            highlight: clampNumber(
                c.eventWeight?.highlight,
                -1,
                1,
                DEFAULT_AFFINITY_CONFIG.eventWeight.highlight,
            ),
            highlightRemoved: clampNumber(
                c.eventWeight?.highlightRemoved,
                -1,
                1,
                DEFAULT_AFFINITY_CONFIG.eventWeight.highlightRemoved,
            ),
            impression: clampNumber(
                c.eventWeight?.impression,
                -1,
                1,
                DEFAULT_AFFINITY_CONFIG.eventWeight.impression,
            ),
        },
    };
}

/**
 * Finalize a DefaultAffinity change request.
 *
 * The doc is a singleton — force the fixed `_id` regardless of what the client
 * sent, so `AuthIdentityService.getDefaultAffinity`'s lookup always finds exactly one
 * doc. Clamp each score into [0, 1] and drop non-finite/negative entries (a
 * cheap guard against a fat-fingered CMS input feeding a bad value into every
 * new user's cloned profile) and cap the tag count. `config` (the affinity engine
 * tuning knobs) is clamped/defaulted the same way — see `normalizeConfig`.
 */
export default function processDefaultAffinityDto(doc: DefaultAffinityDto): void {
    doc._id = DEFAULT_AFFINITY_ID;

    const clamped: Record<string, number> = {};
    for (const [tag, score] of Object.entries(doc.affinity ?? {})) {
        if (typeof score !== "number" || !Number.isFinite(score)) continue;
        clamped[tag] = Math.min(1, Math.max(0, score));
    }

    const entries = Object.entries(clamped);
    doc.affinity =
        entries.length <= MAX_DEFAULT_TAGS ? clamped : Object.fromEntries(entries.slice(0, MAX_DEFAULT_TAGS));

    doc.config = normalizeConfig(doc.config);
}
