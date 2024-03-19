import { DocType, Uuid } from "../enums";
import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from "class-validator";
import { GroupAclEntryDto } from "./GroupAclEntryDto";
import { Expose, Type } from "class-transformer";
import { _baseDto } from "./_baseDto";

/**
 * Database structured Post object
 */
export class ChangeDto extends _baseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    docId: Uuid;

    @IsNotEmpty()
    @IsEnum(DocType)
    @Expose()
    docType: DocType;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    memberOf?: Uuid[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => GroupAclEntryDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    acl?: GroupAclEntryDto[];

    @IsOptional()
    @IsString()
    @Expose()
    parentId?: Uuid;

    @IsObject()
    @Expose()
    changes: any;

    @IsNotEmpty()
    @IsString()
    @Expose()
    changedByUser: Uuid;
}
