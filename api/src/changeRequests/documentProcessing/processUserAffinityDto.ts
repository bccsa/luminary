import { UserAffinityDto } from "../../dto/UserAffinityDto";
import { Uuid } from "../../enums";

/**
 * Finalize a UserAffinity change request.
 *
 * The profile is client-authoritative (the server never scores), so this only
 * stamps the server-known owner — any client-supplied `ownerId` is overwritten
 * to prevent spoofing. Owner-only write access is enforced upstream in
 * `validateChangeRequestAccess`.
 */
export default function processUserAffinityDto(doc: UserAffinityDto, userId: Uuid): void {
    doc.ownerId = userId;
}
