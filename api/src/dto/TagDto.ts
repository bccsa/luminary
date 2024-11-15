import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional } from "class-validator";
import { TagType, Uuid } from "../enums";
import { Expose } from "class-transformer";
import { _contentParentDto } from "./_contentParentDto";

/**
 * Database structured Tag object
 */
export class TagDto extends _contentParentDto {
    @IsNotEmpty()
    @IsEnum(TagType)
    @Expose()
    tagType: TagType;

    @IsNumber()
    @IsNotEmpty()
    @Expose()
    pinned: number;

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    taggedDocs?: Uuid[];
}
