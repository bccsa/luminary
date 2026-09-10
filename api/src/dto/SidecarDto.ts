import { IsDefined, IsEnum, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { DocType, SidecarType, Uuid } from "../enums";

/** A parent-scoped payload, never replicated to clients. `memberOf` is copied
 *  from the parent so the permission system gates it. */
export class SidecarDto extends _contentBaseDto {
    @IsString()
    @Expose()
    parentId: Uuid;

    /** Post or Tag — permissions are checked against this type's groups. */
    @IsEnum(DocType)
    @Expose()
    parentType: DocType.Post | DocType.Tag;

    @IsEnum(SidecarType)
    @Expose()
    sidecarType: SidecarType;

    /** `unknown` (not `any`) forces narrowing; shape is set by `sidecarType`. */
    @IsDefined()
    @Expose()
    data: unknown;
}