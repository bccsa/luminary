import { GroupAclEntryDto } from "./GroupAclEntryDto";
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { _baseDto } from "./_baseDto";
import { Expose, Type } from "class-transformer";

/**
 * Database structured Group object
 */
export class GroupDto extends _baseDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    name: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GroupAclEntryDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    acl: GroupAclEntryDto[];

    /**
     * the _id field of a Group document is added by the API as the only memberOf entry to improve database query performance
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    memberOf?: string[];
}
