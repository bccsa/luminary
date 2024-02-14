import { GroupAclEntryDto } from "./GroupAclEntryDto";
import { IsArray, IsNotEmpty, IsString, ValidateNested } from "class-validator";
import { _baseDto } from "./_baseDto";
import { Type } from "class-transformer";

/**
 * Database structured Group object
 */
export class GroupDto extends _baseDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GroupAclEntryDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    acl: GroupAclEntryDto[];
}
