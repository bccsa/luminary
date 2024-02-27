import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { TagType, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";

/**
 * Database structured Tag object
 */
export class TagDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsEnum(TagType)
    @Expose()
    tagType: TagType;

    @IsBoolean()
    @IsNotEmpty()
    @Expose()
    pinned: boolean;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    localisations: Uuid[];

    @IsOptional()
    @IsString()
    @Expose()
    image?: Uuid;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags: Uuid[];
}
