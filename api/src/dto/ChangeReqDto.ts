import { Type } from "class-transformer";
import { Uuid } from "../enums";
import { IsNotEmpty, IsNumber, IsObject, IsString, ValidateNested } from "class-validator";

export class ChangeReqItemDto {
    @IsNotEmpty()
    @IsNumber()
    id: number;

    @IsNotEmpty()
    @IsObject()
    doc: any; // Object containing full submitted / updated document
}

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class ChangeReqDto {
    @IsNotEmpty()
    @IsString()
    reqId: Uuid;

    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ChangeReqItemDto)
    changes: ChangeReqItemDto[];
}
