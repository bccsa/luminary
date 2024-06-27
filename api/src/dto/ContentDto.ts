import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { DocType, PublishStatus, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { IsOptionalIf } from "../validation/IsOptionalIf";
import { Expose } from "class-transformer";

/**
 * Database structured Content object
 */
export class ContentDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    parentId: Uuid;

    @IsOptional()
    @IsString()
    parentType?: DocType;

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

    @IsOptional()
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
    @Min(0)
    @Expose()
    publishDate: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Expose()
    expiryDate?: number;

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    memberOf: Uuid[];

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    tags?: Uuid[];

    @IsOptional() // Optional as it is set upon change request processing
    @IsString()
    @Expose()
    image?: string;
}
