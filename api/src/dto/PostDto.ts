import { Uuid } from "../enums";
import { IsArray, IsOptional, IsBoolean, IsString, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";
import { ImageDto } from "./ImageDto";

/**
 * Database structured Post object
 */
export class PostDto extends _contentBaseDto {
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
}
