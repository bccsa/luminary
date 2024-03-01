import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { PublishStatus, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { IsOptionalIf } from "../validation/IsOptionalIf";
import { Expose } from "class-transformer";

const JANUARY_FIRST_2024_TIMESTAMP = 1704114000000;

/**
 * Database structured Content object
 */
export class ContentDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    parentId: Uuid;

    @IsNotEmpty()
    @IsString()
    @Expose()
    language: Uuid;

    @IsNotEmpty()
    @IsEnum(PublishStatus)
    @Expose()
    status: PublishStatus;

    @IsNotEmpty()
    @IsString()
    @Expose()
    slug: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    title: string;

    @IsOptionalIf((c: ContentDto) => c.status === PublishStatus.Draft)
    @IsString()
    @Expose()
    summary: string;

    @IsOptional()
    @IsString()
    @Expose()
    author: string;

    @IsOptional()
    @IsString()
    @Expose()
    text: string;

    @IsOptional()
    @IsString()
    @Expose()
    localisedImage?: Uuid;

    @IsOptional()
    @IsString()
    @Expose()
    audio?: Uuid;

    @IsOptional()
    @IsString()
    @Expose()
    video?: Uuid;

    @IsOptionalIf((c: ContentDto) => c.status === PublishStatus.Draft)
    @IsNumber()
    @Min(JANUARY_FIRST_2024_TIMESTAMP)
    @Expose()
    publishDate: number;

    @IsOptional()
    @IsNumber()
    @Min(JANUARY_FIRST_2024_TIMESTAMP)
    @Expose()
    expiryDate?: number;
}
