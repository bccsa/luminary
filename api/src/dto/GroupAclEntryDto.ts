import { DocType, Uuid, AclPermission } from "../enums";
import { IsArray, IsEnum, IsNotEmpty, IsString } from "class-validator";

/**
 * Database structured ACL entry (used in GroupDto)
 */
export class GroupAclEntryDto {
    @IsNotEmpty()
    @IsEnum(DocType)
    type: DocType;

    @IsNotEmpty()
    @IsString()
    groupId: Uuid;

    @IsArray()
    @IsEnum(AclPermission, { each: true })
    permission: AclPermission[];
}
