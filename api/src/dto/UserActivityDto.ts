import { Expose, Type } from "class-transformer";
import {
    Equals,
    IsBoolean,
    IsEmpty,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";
import { UserActivityColor, UserActivityType } from "../enums";
import { _baseDocumentDto } from "./_baseDocumentDto";

export const MAX_ACTIVITY_ID_LENGTH = 36;
// Existing document references also include legacy non-UUID ids.
export const MAX_ACTIVITY_REFERENCE_LENGTH = 512;
export const MAX_HIGHLIGHT_TEXT_LENGTH = 10000;

export class UserActivityRangeDto {
    /** Zero-based character offset at the start of the passage. */
    @IsInt()
    @Min(0)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    start: number;

    /** Exclusive character offset at the end of the passage. */
    @IsInt()
    @Min(1)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    end: number;

    /** Saved highlight color; omitted on removal tombstones. */
    @IsOptional()
    @IsEnum(UserActivityColor)
    @Expose()
    color?: UserActivityColor;

    /** Quoted passage used to relocate a highlight after edits; omitted on removal. */
    @IsOptional()
    @IsString()
    @MaxLength(MAX_HIGHLIGHT_TEXT_LENGTH)
    @Expose()
    text?: string;
}

export class BaseUserActivityDto extends _baseDocumentDto<UserActivityType> {
    /** Deterministic UUID identifying a post activity or a specific highlighted passage. */
    @IsUUID("5")
    @MaxLength(MAX_ACTIVITY_ID_LENGTH)
    @Expose()
    _id: string;

    /** Activity kind used to select the matching DTO. */
    @IsEnum(UserActivityType)
    @Expose()
    type: UserActivityType;

    /** Identifier of the post this activity belongs to. */
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_ACTIVITY_REFERENCE_LENGTH)
    @Expose()
    parentId: string;

    /** Time of the user's action in UTC milliseconds, used to order conflicting changes. */
    @IsInt()
    @Min(0)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    activityTimeUtc: number;

    /** Marks a removed activity so the removal can reach other devices. */
    @IsOptional()
    @IsBoolean()
    @Expose()
    deleted?: boolean;

    /** Server-assigned CouchDB revision; ignored on submitted changes. */
    @Expose()
    _rev?: string;

    /** Server-assigned update time in UTC milliseconds, used as the sync cursor. */
    @Expose()
    updatedTimeUtc?: number;
}

export class ViewedActivityDto extends BaseUserActivityDto {
    /** Identifies a viewed-post activity. */
    @Equals(UserActivityType.Viewed)
    type: UserActivityType.Viewed;

    /** Disallowed because viewing applies to a post rather than a translation. */
    @IsEmpty()
    contentId?: never;

    /** Disallowed because viewing does not identify a highlighted passage. */
    @IsEmpty()
    range?: never;
}

export class LikedActivityDto extends BaseUserActivityDto {
    /** Identifies a liked-post activity. */
    @Equals(UserActivityType.Liked)
    type: UserActivityType.Liked;

    /** Disallowed because liking applies to a post rather than a translation. */
    @IsEmpty()
    contentId?: never;

    /** Disallowed because liking does not identify a highlighted passage. */
    @IsEmpty()
    range?: never;
}

export class HighlightedActivityDto extends BaseUserActivityDto {
    /** Identifies a highlighted passage. */
    @Equals(UserActivityType.Highlighted)
    type: UserActivityType.Highlighted;

    /** Identifier of the content translation containing the highlighted passage. */
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_ACTIVITY_REFERENCE_LENGTH)
    @Expose()
    contentId: string;

    /** Passage offsets, with color and quoted text omitted on removal tombstones. */
    @IsObject()
    @ValidateNested()
    @Type(() => UserActivityRangeDto)
    @Expose()
    range: UserActivityRangeDto;
}

export type UserActivityDto = ViewedActivityDto | LikedActivityDto | HighlightedActivityDto;

export const USER_ACTIVITY_DTO_CLASSES = {
    [UserActivityType.Viewed]: ViewedActivityDto,
    [UserActivityType.Liked]: LikedActivityDto,
    [UserActivityType.Highlighted]: HighlightedActivityDto,
} as const;
