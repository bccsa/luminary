import { IsArray, IsNotEmpty } from "class-validator";
import { DocType, Uuid } from "../types";

/**
 * Database structured Language object
 */
export class LanguageDto {
    @IsNotEmpty()
    _id: Uuid;
    @IsNotEmpty()
    type: DocType.Language;
    @IsArray()
    memberOf: Uuid[];
    @IsNotEmpty()
    languageCode: string;
    @IsNotEmpty()
    name: string;
}
