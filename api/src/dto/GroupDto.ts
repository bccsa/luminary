import { DocType, Uuid } from "../types";
import { GroupAclEntryDto } from "./GroupAclEntryDto";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

/**
 * Database structured Group object
 */
export class GroupDto {
    @IsNotEmpty()
    _id: Uuid;
    _rev?: string;
    @IsNotEmpty()
    type: DocType.Group;
    updatedTimeUtc?: number;
    @IsString()
    name: string;
    @IsArray()
    acl: Array<GroupAclEntryDto>;
}
