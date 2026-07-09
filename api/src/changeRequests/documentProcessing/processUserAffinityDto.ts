import { UserAffinityDto } from "../../dto/UserAffinityDto";
import { Uuid } from "../../enums";

/** Generous ceiling on the number of tags a client-scored profile can carry. */
const MAX_USER_TAGS = 200;

/**
 * Finalize a UserAffinity change request.
 *
 * The profile is client-authoritative (the server never scores), so this only
 * stamps the server-known owner — any client-supplied `ownerId` is overwritten
 * to prevent spoofing. Owner-only write access is enforced upstream in
 * `validateChangeRequestAccess`.
 *
 * Clamp each score into [0, 1] and drop non-finite/non-numeric entries — a
 * malformed or malicious client can only corrupt its OWN ranking (this doc is
 * never read by anyone but its owner), but an unbounded/garbage value could
 * still break client-side sort comparisons (NaN, Infinity) or bloat the doc
 * indefinitely. Mirrors `processDefaultAffinityDto`'s guard.
 */
export default function processUserAffinityDto(doc: UserAffinityDto, userId: Uuid): void {
    doc.ownerId = userId;

    const clamped: Record<string, number> = {};
    for (const [tag, score] of Object.entries(doc.affinity ?? {})) {
        if (typeof score !== "number" || !Number.isFinite(score)) continue;
        clamped[tag] = Math.min(1, Math.max(0, score));
    }

    const entries = Object.entries(clamped);
    doc.affinity =
        entries.length <= MAX_USER_TAGS ? clamped : Object.fromEntries(entries.slice(0, MAX_USER_TAGS));
}
