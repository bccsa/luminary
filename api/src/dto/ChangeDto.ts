import { DocType, Uuid } from "../types";
import { IsNotEmpty, IsObject } from "class-validator";
import { GroupAclEntryDto } from "./GroupAclEntryDto";

/**
 * Database structured Post object
 */
export class ChangeDto {
    @IsNotEmpty()
    _id: Uuid;
    @IsNotEmpty()
    type: DocType.Change;
    @IsNotEmpty()
    docId: Uuid;
    @IsNotEmpty()
    docType: DocType;
    memberOf?: Uuid[];
    acl?: GroupAclEntryDto[];
    @IsObject()
    changes: any;
}
