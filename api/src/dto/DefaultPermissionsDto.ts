import { DocType, Uuid } from "../enums";
import { _baseDto } from "./_baseDto";
import { IsArray, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * Singleton document describing the baseline group membership granted to every
 * user on the platform, regardless of whether they are authenticated or which
 * auth provider they came through.
 *
 * The listed `defaultGroups` are merged into each user's effective group set at
 * sync/ACL time, so they act as the floor of permissions for all clients. The
 * document itself is locked to the super-admins group via `memberOf` so only
 * super-admins can modify the platform-wide defaults.
 */
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
