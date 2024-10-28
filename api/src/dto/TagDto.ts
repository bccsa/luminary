import { IsEnum, IsNotEmpty, IsNumber } from "class-validator";
import { TagType } from "../enums";
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
}
