import { Expose, Type } from "class-transformer";
import {
    Equals,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";

export const MAX_ACTIVITY_ID_LENGTH = 1024;
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

    @IsIn(["yellow", "green", "blue", "pink", "purple"])
    @Expose()
    color: "yellow" | "green" | "blue" | "pink" | "purple";

    @IsString()
    @MaxLength(MAX_HIGHLIGHT_TEXT_LENGTH)
    @Expose()
    text: string;
}

export class UserActivityPayloadDto {
    @IsObject()
    @ValidateNested()
    @Type(() => UserActivityRangeDto)
    @Expose()
    range: UserActivityRangeDto;
}

/** Independent mirror of shared UserActivityDto; never enters the shared-dataset DocType enum. */
export class UserActivityDto {
    @IsString()
    @MaxLength(MAX_ACTIVITY_ID_LENGTH)
    @Matches(/^(viewed|liked|highlighted):[^\r\n\0]+$/)
    @Expose()
    _id: string;

    @Equals("userActivity")
    @Expose()
    type: "userActivity";

    @IsIn(["viewed", "liked", "highlighted"])
    @Expose()
    activityType: "viewed" | "liked" | "highlighted";

    @IsString()
    @IsNotEmpty()
    @MaxLength(512)
    @Expose()
    parentId: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(512)
    @Expose()
    contentId?: string;

    @IsInt()
    @Min(0)
    @Max(Number.MAX_SAFE_INTEGER)
    @Expose()
    activityTimeUtc: number;

    @IsOptional()
    @IsBoolean()
    @Expose()
    deleted?: boolean;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => UserActivityPayloadDto)
    @Expose()
    payload?: UserActivityPayloadDto;

    // Server-only fields have no validation decorators, so whitelist strips client values.
    @Expose()
    _rev?: string;

    @Expose()
    updatedTimeUtc?: number;
}
