import { Uuid } from "../enums";
import { IsArray, IsNotEmpty, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * Database structured Post object
 */
export class PostDto extends _contentBaseDto {
    @IsArray()
    @IsString({ each: true })
    content: Uuid[];

    @IsNotEmpty()
    @IsString()
    image: Uuid;

    @IsArray()
    @IsString({ each: true })
    tags: Uuid[];
}
