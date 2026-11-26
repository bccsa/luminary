import { Expose } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

/** Document identity shared by group-scoped and owner-scoped DTOs. */
export class _baseDocumentDto<TType extends string = string> {
    @IsNotEmpty()
    @IsString()
    @Expose()
    _id: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    type: TType;
}
