import { Uuid } from "../enums";
import { IsArray, IsOptional, IsBoolean, IsString, IsIn, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";
import { ImageDto } from "./ImageDto";
import { MediaDto } from "./MediaDto";

/**
 * Database structured _contentParent object
 */
export class _contentParentDto extends _contentBaseDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => ImageDto)
    @Expose()
    imageData?: ImageDto;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags: Uuid[];

    @IsBoolean()
    @Expose()
    publishDateVisible: boolean;

    @IsOptional()
    @IsBoolean()
    @Expose()
    showComingSoon?: boolean;

    @IsOptional()
    @IsBoolean()
    @Expose()
    alwaysOffline?: boolean;

    @IsOptional()
    @IsBoolean()
    @Expose()
    useVerticalTileLayout?: boolean;

    @IsOptional()
    @IsString()
    @Expose()
    imageBucketId?: string; // S3 bucket ID for image storage

    @IsOptional()
    @ValidateNested()
    @Type(() => MediaDto)
    @Expose()
    media?: MediaDto;

    @IsOptional()
    @IsString()
    @Expose()
    mediaBucketId?: string; // S3 bucket ID for media storage

    @IsOptional()
    @IsString()
    @IsIn(["person", "org"])
    @Expose()
    authorType?: "person" | "org"; // Drives jsonLD author @type: "org" = Organization, "person"/undefined = Person
}
