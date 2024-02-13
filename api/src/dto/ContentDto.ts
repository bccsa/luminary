import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ContentStatus, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * Database structured Content object
 */
export class ContentDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    language: Uuid;

    @IsNotEmpty()
    @IsEnum(ContentStatus)
    status: ContentStatus;

    @IsString()
    @IsNotEmpty()
    slug: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    summary: string;

    @IsString()
    @IsOptional()
    author: string;

    @IsString()
    @IsOptional()
    text: string;

    // @IsString()
    // @IsOptional()
    // seo: string;

    @IsString()
    @IsOptional()
    localisedImage?: Uuid;

    @IsString()
    @IsOptional()
    audio?: Uuid;

    @IsString()
    @IsOptional()
    video?: Uuid;

    @IsDate()
    @IsNotEmpty()
    publishDate: number;

    @IsDate()
    @IsOptional()
    expiryDate?: number;
}
