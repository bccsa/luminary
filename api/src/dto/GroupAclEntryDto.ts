import { DocType, Uuid, AclPermission } from "../types";
import { IsArray, IsNotEmpty } from "class-validator";

/**
 * Database structured ACL entry (used in GroupDto)
 */
export class GroupAclEntryDto {
    @IsNotEmpty()
    type: DocType;
    @IsNotEmpty()
    groupId: Uuid;
    @IsArray()
    permission: Array<AclPermission>;
}
