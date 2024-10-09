import { PostType } from "../enums";
import { IsNotEmpty, IsEnum } from "class-validator";
import { Expose } from "class-transformer";
import { _contentParentDto } from "./_contentParentDto";

/**
 * Database structured Post object
 */
export class PostDto extends _contentParentDto {
    @IsNotEmpty()
    @IsEnum(PostType)
    @Expose()
    postType: PostType;
}
