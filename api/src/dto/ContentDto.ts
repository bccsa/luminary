import { IsArray, IsNotEmpty, IsNumber, IsString } from "class-validator";
import { ContentStatus, DocType, Uuid } from "../types";

/**
 * Database structured Content object
 */
export class ContentDto {
    @IsNotEmpty()
    _id: Uuid;
    @IsNotEmpty()
    type: DocType.Content;
    @IsArray()
    memberOf: Uuid[];
    @IsNotEmpty()
    language: Uuid;
    @IsNotEmpty()
    status: ContentStatus;
    @IsString()
    slug: string;
    @IsString()
    title: string;
    @IsString()
    summary: string;
    @IsString()
    author: string;
    @IsString()
    text: string;
    @IsString()
    seo: string;
    localisedImage?: Uuid;
    audio?: Uuid;
    video?: Uuid;
    @IsNumber()
    publishDate: number;
    expiryDate?: number;
}
