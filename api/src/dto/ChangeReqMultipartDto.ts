import { Expose } from "class-transformer";
import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class ChangeReqMultipartDto {
    @IsOptional()
    @IsString()
    @Expose()
    apiVersion?: string;

    @IsNotEmpty()
    @IsNumber()
    @Expose()
    id: number;

    fileName?: string;

    filePreset?: string;

    @IsNotEmpty()
    @IsObject()
    @Expose()
    doc: any; // Object containing full submitted / updated document
}
