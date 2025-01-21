import { IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";

/**
 * Database structured Language object
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
    translations: Record<string, string>;
}
