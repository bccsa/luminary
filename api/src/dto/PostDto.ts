import { Uuid } from "../enums";
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";
import { ContentMetadataDto } from "./ContentMetadataDto";

/**
 * Database structured Post object
 */
export class PostDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    image: Uuid;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags: Uuid[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContentMetadataDto)
    @Expose()
    metadata?: ContentMetadataDto[] = [];
}
