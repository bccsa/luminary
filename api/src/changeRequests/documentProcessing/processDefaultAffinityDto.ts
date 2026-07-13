import { DefaultAffinityDto } from "../../dto/DefaultAffinityDto";
import { DEFAULT_AFFINITY_ID } from "../../util/defaultAffinity";

/** Generous ceiling on the number of tags an editor can curate into the default profile. */
const MAX_DEFAULT_TAGS = 200;

/**
 * Finalize a DefaultAffinity change request.
 *
 * The doc is a singleton — force the fixed `_id` regardless of what the client
 * sent, so `AuthIdentityService.getAffinity`'s lookup always finds exactly one
 * doc. Clamp each score into [0, 1] and drop non-finite/negative entries (a
 * cheap guard against a fat-fingered CMS input feeding a bad value into every
 * new user's cloned profile) and cap the tag count.
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
}
