import { AuthProviderConfigDto } from "../../dto/AuthProviderConfigDto";

/**
 * Process AuthProviderConfig DTO
 * - Enforces singleton ID to prevent duplicate docs
 */
export default async function processAuthProviderConfigDto(doc: AuthProviderConfigDto) {
    doc._id = "authProviderConfig";
}
