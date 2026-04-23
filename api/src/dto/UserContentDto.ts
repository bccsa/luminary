import { Equals, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { _userDataBaseDto } from "./_userDataBaseDto";
import { DocType, Uuid } from "../enums";
import { HighlightEntry } from "./HighlightEntry";

/**
 * A user's state for a single piece of content — reading position and
 * highlights. One doc per (user, content) pair, with a deterministic id
 * `{userId}:userContent:{contentId}`.
 */
export class UserContentDto extends _userDataBaseDto {
    @Equals(DocType.UserContent)
    @Expose()
    public type: DocType.UserContent;

    @IsNotEmpty()
    @IsString()
    @Expose()
    public contentId: Uuid;

    @IsOptional()
    @IsNumber()
    @Expose()
    public readingPos?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => HighlightEntry)
    @Expose()
    public highlights?: HighlightEntry[];
}
