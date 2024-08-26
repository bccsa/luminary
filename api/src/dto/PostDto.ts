import { Uuid } from "../enums";
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";

/**
 * Database structured Post object
 */
export class PostDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    image: Uuid;

    @IsOptional()
    @IsString()
    @Expose()
    imageId: Uuid;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags: Uuid[];

    @IsBoolean()
    @IsOptional()
    @Expose()
    publishDateVisible?: boolean;
}
