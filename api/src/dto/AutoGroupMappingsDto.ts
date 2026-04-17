import { DocType, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    ArrayNotEmpty,
    ValidateNested,
} from "class-validator";
import { Expose, Type } from "class-transformer";

export class AuthProviderCondition {
    @IsString()
    @IsNotEmpty()
    @Expose()
    type: "authenticated" | "claimEquals" | "claimIn";

    @IsOptional()
    @IsString()
    @Expose()
    claimPath?: string;

    @IsOptional()
    @Expose()
    value?: string | string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    values?: string[];
}

export class AutoGroupMappingsDto extends _contentBaseDto {
    public constructor(init?: Partial<AutoGroupMappingsDto>) {
        super();
        this.type = DocType.AutoGroupMappings;
        Object.assign(this, init);
    }

    @IsOptional()
    @IsString()
    @Expose()
    public description?: string;

    @IsOptional()
    @IsString()
    @Expose()
    public providerId?: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @Expose()
    public groupIds: string[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuthProviderCondition)
    @Expose()
    public conditions: AuthProviderCondition[];
}
