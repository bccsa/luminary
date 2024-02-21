import { IsNotEmpty, IsNumber, IsObject } from "class-validator";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class ChangeReqDto {
    @IsNotEmpty()
    @IsNumber()
    id: number;

    @IsNotEmpty()
    @IsObject()
    doc: any; // Object containing full submitted / updated document
}
