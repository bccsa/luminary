import { IsBoolean, IsEnum, IsNotEmpty } from "class-validator";
import { TagType } from "../enums";
import { Expose } from "class-transformer";
import { PostDto } from "./PostDto";

/**
 * Database structured Tag object
 */
export class TagDto extends PostDto {
    @IsNotEmpty()
    @IsEnum(TagType)
    @Expose()
    tagType: TagType;

    @IsBoolean()
    @IsNotEmpty()
    @Expose()
    pinned: boolean;
}
