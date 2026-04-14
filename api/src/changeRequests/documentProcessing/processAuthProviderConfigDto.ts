import { AuthProviderConfigDto } from "../../dto/AuthProviderConfigDto";

/**
 * Process AuthProviderConfig DTO
 * - Enforces singleton ID to prevent duplicate docs
 * - Enforces memberOf to prevent privilege escalation
 */
export default async function processAuthProviderConfigDto(doc: AuthProviderConfigDto) {
    doc._id = "authProviderConfig";
    doc.memberOf = ["group-super-admins"];
}
