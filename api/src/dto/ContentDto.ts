import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from "class-validator";
import { DocType, PostType, PublishStatus, TagType, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { IsOptionalIf } from "../validation/IsOptionalIf";
import { Expose } from "class-transformer";
import { ImageDto } from "./ImageDto";

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
    @Expose()
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

    @IsOptional()
    @IsString()
    @Expose()
    seoTitle?: string;

    @IsOptional()
    @IsString()
    @Expose()
    seoString?: string;

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    memberOf: Uuid[]; // Even though this field is copied from the parent, the property is not prefixed with "parent" as it is used in database queries in the same was as the parent's field.

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    parentTags?: Uuid[];

    @IsOptional() // Optional as it is set upon change request processing. No need to validate the field as it is set by the system.
    @Expose()
    parentImageData?: ImageDto;

    @IsOptional() // Optional as it is set upon change request processing. Included for backward compatibility.
    @IsString()
    @Expose()
    parentImage?: string;

    @IsOptional() // Optional as it is set upon change request processing
    @IsString()
    @Expose()
    parentTagType?: TagType;

    @IsOptional() // Optional as it is set upon change request processing
    @IsString()
    @Expose()
    parentPostType?: PostType;

    @IsOptional() // Optional as it is set upon change request processing
    @IsBoolean()
    @Expose()
    parentPublishDateVisible?: boolean;

    @IsOptional() // Optional as it is set upon change request processing
    @IsNumber()
    @Expose()
    parentPinned?: number;

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    parentTaggedDocs?: Uuid[];

    @IsOptional() // Optional as it is set upon change request processing
    @IsArray()
    @Expose()
    availableTranslations?: Uuid[];

    @IsOptional() // Optional as it is set upon change request processing
    @IsString()
    @Expose()
    parentImageBucketId?: string; // Inherited from parent Post/Tag for image storage

    @IsOptional()
    @IsString()
    @Expose()
    copyright?: string;
}
