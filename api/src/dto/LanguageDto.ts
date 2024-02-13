import { IsNotEmpty, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * Database structured Language object
 */
export class LanguageDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    languageCode: string;

    @IsNotEmpty()
    @IsString()
    name: string;
}
