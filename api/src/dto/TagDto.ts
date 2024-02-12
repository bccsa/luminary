import { IsArray, IsBoolean, IsNotEmpty } from "class-validator";
import { DocType, TagType, Uuid } from "../types";

/**
 * Database structured Tag object
 */
export class TagDto {
    @IsNotEmpty()
    _id: Uuid;
    @IsNotEmpty()
    type: DocType.Tag;
    @IsArray()
    memberOf: Uuid[];
    @IsNotEmpty()
    tagType: TagType;
    @IsBoolean()
    pinned: boolean;
    @IsArray()
    localisations: Uuid[];
    image?: Uuid;
    @IsArray()
    tags: Uuid[];
}
