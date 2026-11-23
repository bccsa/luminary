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
    @IsInt()
    @Min(0)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    start: number;

    @IsInt()
    @Min(1)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    end: number;

    @IsOptional()
    @IsEnum(UserActivityColor)
    @Expose()
    color?: UserActivityColor;

    @IsOptional()
    @IsString()
    @MaxLength(MAX_HIGHLIGHT_TEXT_LENGTH)
    @Expose()
    text?: string;
}

export class BaseUserActivityDto extends _baseDocumentDto<UserActivityType> {
    @IsUUID("5")
    @MaxLength(MAX_ACTIVITY_ID_LENGTH)
    @Expose()
    _id: string;

    @IsEnum(UserActivityType)
    @Expose()
    type: UserActivityType;

    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_ACTIVITY_REFERENCE_LENGTH)
    @Expose()
    parentId: string;

    @IsInt()
    @Min(0)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    activityTimeUtc: number;

    @IsOptional()
    @IsBoolean()
    @Expose()
    deleted?: boolean;

    // Whitelist validation strips client-supplied server metadata.
    @Expose()
    _rev?: string;

    @Expose()
    updatedTimeUtc?: number;
}

export class ViewedActivityDto extends BaseUserActivityDto {
    @Equals(UserActivityType.Viewed)
    type: UserActivityType.Viewed;

    @IsEmpty()
    contentId?: never;

    @IsEmpty()
    range?: never;
}

export class LikedActivityDto extends BaseUserActivityDto {
    @Equals(UserActivityType.Liked)
    type: UserActivityType.Liked;

    @IsEmpty()
    contentId?: never;

    @IsEmpty()
    range?: never;
}

export class HighlightedActivityDto extends BaseUserActivityDto {
    @Equals(UserActivityType.Highlighted)
    type: UserActivityType.Highlighted;

    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_ACTIVITY_REFERENCE_LENGTH)
    @Expose()
    contentId: string;

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
