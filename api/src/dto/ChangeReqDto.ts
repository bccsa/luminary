import { Expose } from "class-transformer";
import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class ChangeReqDto {
    @IsOptional()
    @IsString()
    @Expose()
    apiVersion?: string;

    @IsNotEmpty()
    @IsObject()
    @Expose()
    doc: any; // Object containing full submitted / updated document
}
