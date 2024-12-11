import { IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";
import { IsStringTranslationRecord } from "../validation/IsStringTranslationRecord";

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
    @IsOptional()
    @IsStringTranslationRecord()
    translations?: Record<string, string>;
}
