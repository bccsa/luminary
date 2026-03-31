import { DefaultPermissionsDto } from "../../dto/DefaultPermissionsDto";

/**
 * Process DefaultPermissions DTO
 * - Enforces singleton ID to prevent duplicate docs
 * - Enforces memberOf to prevent privilege escalation
 */
export default async function processDefaultPermissionsDto(doc: DefaultPermissionsDto) {
    doc._id = "defaultPermissions";
    doc.memberOf = ["group-super-admins"];
}
