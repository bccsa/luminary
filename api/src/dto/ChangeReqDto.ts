import { Expose } from "class-transformer";
import { IsNotEmpty, IsNumber, IsObject } from "class-validator";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class ChangeReqDto {
    @IsNotEmpty()
    @IsNumber()
    @Expose()
    id: number;

    @IsNotEmpty()
    @IsObject()
    @Expose()
    doc: any; // Object containing full submitted / updated document
}
