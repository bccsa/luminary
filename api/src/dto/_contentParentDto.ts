import { Uuid } from "../enums";
import { IsArray, IsOptional, IsBoolean, IsString, ValidateNested } from "class-validator";
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
    @ValidateNested()
    @Type(() => MediaDto)
    @Expose()
    media?: MediaDto;
}
