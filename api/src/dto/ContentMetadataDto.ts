import { PublishStatus, Uuid } from "../enums";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Expose } from "class-transformer";

/**
 * Database structured Post object
 */
export class ContentMetadataDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    contentId: Uuid;

    @IsNotEmpty()
    @IsString()
    @Expose()
    languageId: Uuid;

    @IsNotEmpty()
    @IsString()
    @Expose()
    title: string;

    @IsNotEmpty()
    @IsEnum(PublishStatus)
    @Expose()
    status: PublishStatus;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Expose()
    publishDate?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Expose()
    expiryDate?: number;
}
