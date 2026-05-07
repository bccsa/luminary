import { IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";

/**
 * Database structured Language object.
 * * @property {number} averageReadingSpeed - The average reading speed in words per minute
 * for this language, used to calculate reading time for content.
 * If not provided, a default of 200 wpm is assumed.
 */
export class LanguageDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
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
    @Expose()
    averageReadingSpeed?: number;
}
