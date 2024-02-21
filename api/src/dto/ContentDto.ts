import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { PublishStatus, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { IsOptionalIf } from "../validation/IsOptionalIf";

const JANUARY_FIRST_2024_TIMESTAMP = 1704114000000;

/**
 * Database structured Content object
 */
export class ContentDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    language: Uuid;

    @IsNotEmpty()
    @IsEnum(PublishStatus)
    status: PublishStatus;

    @IsNotEmpty()
    @IsString()
    slug: string;

    @IsNotEmpty()
    @IsString()
    title: string;

    @IsOptionalIf((c: ContentDto) => c.status === PublishStatus.Draft)
    @IsString()
    summary: string;

    @IsOptional()
    @IsString()
    author: string;

    @IsOptional()
    @IsString()
    text: string;

    @IsOptional()
    @IsString()
    localisedImage?: Uuid;

    @IsOptional()
    @IsString()
    audio?: Uuid;

    @IsOptional()
    @IsString()
    video?: Uuid;

    @IsOptionalIf((c: ContentDto) => c.status === PublishStatus.Draft)
    @IsNumber()
    @Min(JANUARY_FIRST_2024_TIMESTAMP)
    publishDate: number;

    @IsOptional()
    @IsNumber()
    @Min(JANUARY_FIRST_2024_TIMESTAMP)
    expiryDate?: number;
}
