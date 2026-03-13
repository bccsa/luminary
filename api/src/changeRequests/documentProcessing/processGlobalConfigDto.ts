import { GlobalConfigDto } from "../../dto/GlobalConfigDto";

/**
 * Process GlobalConfig DTO
 * - Enforces singleton ID to prevent duplicate docs
 * - Enforces memberOf to prevent privilege escalation
 */
export default async function processGlobalConfigDto(doc: GlobalConfigDto) {
    doc._id = "global-config";
    doc.memberOf = ["group-super-admins"];
}
