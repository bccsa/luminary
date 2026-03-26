import { DocType, Uuid } from "../enums";
import { _baseDto } from "./_baseDto";
import { IsArray, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class DefaultPermissionsDto extends _baseDto {
    public constructor(init?: Partial<DefaultPermissionsDto>) {
        super();
        this.type = DocType.DefaultPermissions;
        Object.assign(this, init);
    }

    /**
     * Group membership for sync and ACL.
     * Always enforced to ["group-super-admins"] by processDefaultPermissionsDto.
     */
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public memberOf!: Uuid[];

    /**
     * Group IDs automatically assigned to all users unauthenticated or authenticated.
     */
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public defaultGroups!: Uuid[];
}
