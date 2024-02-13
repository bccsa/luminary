import { DocType, Uuid } from "../enums";
import { Equals, IsNotEmpty, IsObject, IsString } from "class-validator";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 * After successful processing, a differential "change" document (ChangeDto) is generated by the
 * API from the UpdateDto and distributed to clients.
 */
export class ChangeReqDto {
    @IsNotEmpty()
    @IsString()
    reqId: Uuid;

    @IsNotEmpty()
    @Equals("changeReq")
    type: DocType.ChangeReq;

    @IsObject()
    doc: any; // Object containing full submitted / updated document
}
