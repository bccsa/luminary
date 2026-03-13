import { DocType, Uuid } from "../enums";
import { _baseDto } from "./_baseDto";
import { IsArray, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class GlobalConfigDto extends _baseDto {
    public constructor(init?: Partial<GlobalConfigDto>) {
        super();
        this.type = DocType.GlobalConfig;
        Object.assign(this, init);
    }

    /**
     * Group membership for sync and ACL.
     * Always enforced to ["group-super-admins"] by processGlobalConfigDto.
     */
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public memberOf!: Uuid[];

    /**
     * Group IDs automatically assigned to all users at login.
     */
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public defaultGroups!: Uuid[];
}
