import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { PublishStatus, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

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

    @IsString()
    // TODO required if status set to published
    @IsOptional()
    slug: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    // TODO required if status set to published
    @IsOptional()
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
    @IsOptional()
    publishDate: number;

    @IsDate()
    // TODO required if status set to published
    @IsOptional()
    expiryDate?: number;
}
