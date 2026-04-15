import { DefaultPermissionsDto } from "../../dto/DefaultPermissionsDto";

/**
 * Process DefaultPermissions DTO
 * - Enforces singleton ID to prevent duplicate docs
 */
export default async function processDefaultPermissionsDto(doc: DefaultPermissionsDto) {
    doc._id = "defaultPermissions";
}
