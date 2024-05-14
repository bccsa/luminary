import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * Database structured ImageFile object
 */
export class ImageFileDto {
    @IsNotEmpty()
    @IsNumber()
    @Expose()
    width: number;

    @IsNotEmpty()
    @IsNumber()
    @Expose()
    height: number;

    @IsNotEmpty()
    @IsNumber()
    @Expose()
    aspectRatio: number;

    @IsOptional()
    @IsString()
    @Expose()
    filename: string;
}
