import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { _baseDto } from "./_baseDto";
import { Expose, Type } from "class-transformer";
import { DeleteReason, DocType, Uuid } from "../enums";

/**
 * Database structured document delete command object
 */
export class DeleteCmdDto extends _baseDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    docId: Uuid;

    /**
     * docType is used by the client to determine whether the client has permission to keep the document. For ContentDto documents, this field is set to the DocType of the parent document, as the permission system does not specify permissions for ContentDto documents.
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    docType: DocType;

    @IsString()
    @IsNotEmpty()
    @Expose()
    deleteReason: DeleteReason;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => String) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @IsOptional()
    @Expose()
    memberOf?: Uuid[];

    /**
     * List of groups which should not delete the document (only used when the delete reason is "permissionChange" for all documents except group documents)
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => String) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @IsOptional()
    @Expose()
    newMemberOf?: Uuid[];

    @IsOptional()
    @Expose()
    @IsString()
    @Expose()
    slug?: string;
}
