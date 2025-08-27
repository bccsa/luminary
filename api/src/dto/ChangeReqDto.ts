import { Expose } from "class-transformer";
import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class ChangeReqDto {
    @IsOptional()
    @IsString()
    @Expose()
    apiVersion?: string;

    @IsNotEmpty()
    @IsNumber()
    @Expose()
    id: number;

    @IsNotEmpty()
    @IsObject()
    @Expose()
    doc: any; // Object containing full submitted / updated document
}

export function processChangeRequest(change) {
    console.log("[processChangeRequest] Triggered with:", change); // ⭐
    // existing logic...
    return change;
}
