import { GlobalAffinityDto } from "../../dto/GlobalAffinityDto";
import { GLOBAL_AFFINITY_ID, normalizeContribution } from "../../util/globalAffinity";

/**
 * Finalize a GlobalAffinity change request.
 *
 * The doc is a singleton — force the fixed `_id` regardless of what the client sent.
 * Everything a client may influence is confined to `contribution`, which is re-normalized
 * here rather than trusted: a client that skipped (or gamed) its own normalization still
 * ends up with exactly one vote's worth of influence.
 *
 * `affinity` is stripped: it is server-owned, and `processChangeRequest` hands this doc to
 * the accumulator instead of writing it, so nothing a client sends reaches the database.
 */
export default function processGlobalAffinityDto(doc: GlobalAffinityDto): void {
    doc._id = GLOBAL_AFFINITY_ID;
    doc.contribution = normalizeContribution(doc.contribution);
    delete doc.affinity;
    delete doc.lastDecayUtc;
    delete doc.contributionCount;
}
