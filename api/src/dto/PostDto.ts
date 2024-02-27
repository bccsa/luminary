import { Uuid } from "../enums";
import { IsArray, IsNotEmpty, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";

/**
 * Database structured Post object
 */
export class PostDto extends _contentBaseDto {
    @IsArray()
    @IsString({ each: true })
    @Expose()
    content: Uuid[];

    @IsNotEmpty()
    @IsString()
    @Expose()
    image: Uuid;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags: Uuid[];
}
