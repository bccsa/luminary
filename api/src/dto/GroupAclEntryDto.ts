import { Expose } from "class-transformer";
import { DocType, Uuid, AclPermission } from "../enums";
import { IsArray, IsEnum, IsNotEmpty, IsString } from "class-validator";

/**
 * Database structured ACL entry (used in GroupDto)
 */
export class GroupAclEntryDto {
    @IsNotEmpty()
    @IsEnum(DocType)
    @Expose()
    type: DocType;

    @IsNotEmpty()
    @IsString()
    @Expose()
    groupId: Uuid;

    @IsArray()
    @IsEnum(AclPermission, { each: true })
    @Expose()
    permission: AclPermission[];
}
