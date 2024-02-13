import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { TagType, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * Database structured Tag object
 */
export class TagDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsEnum(TagType)
    tagType: TagType;

    @IsBoolean()
    @IsNotEmpty()
    pinned: boolean;

    @IsArray()
    @IsString({ each: true })
    localisations: Uuid[];

    @IsOptional()
    @IsString()
    image?: Uuid;

    @IsArray()
    @IsString({ each: true })
    tags: Uuid[];
}
