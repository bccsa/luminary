import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";
import { IsBcp47LanguageTag } from "../validation/IsBcp47LanguageTag";

/**
 * Database structured Language object.
 */
export class LanguageDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @IsBcp47LanguageTag()
    @Expose()
    languageCode: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    name: string;

    @IsOptional()
    @IsInt()
    @Expose()
    default?: number;

    @Expose()
    @IsNotEmpty()
    translations: Record<string, string>;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Expose()
    averageReadingSpeed?: number;
}
