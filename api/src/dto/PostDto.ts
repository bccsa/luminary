import { DocType, Uuid } from "../types";
import { IsArray, IsNotEmpty } from "class-validator";

/**
 * Database structured Post object
 */
export class PostDto {
    @IsNotEmpty()
    _id: Uuid;
    @IsNotEmpty()
    type: DocType.Post;
    @IsArray()
    memberOf: Uuid[];
    @IsArray()
    content: Uuid[];
    @IsNotEmpty()
    image: Uuid;
    @IsArray()
    tags: Uuid[];
}
