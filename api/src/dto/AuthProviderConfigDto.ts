import { DocType, Uuid } from "../enums";
import { _baseDto } from "./_baseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    ValidateNested,
    IsArray,
    IsObject,
} from "class-validator";
import { Expose, Type } from "class-transformer";

export class AuthProviderCondition {
    @IsString()
    @IsNotEmpty()
    @Expose()
    type!: "authenticated" | "claimEquals" | "claimIn";

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

export class AuthProviderGroupMapping {
    @IsString()
    @IsNotEmpty()
    @Expose()
    groupId!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuthProviderCondition)
    @Expose()
    conditions!: AuthProviderCondition[];
}

/**
 * Sensitive provider configuration synced only to the CMS.
 * Contains server-side JWT processing rules that the app does not need.
 * Links to AuthProviderDto via providerId.
 */
export class AuthProviderConfigDto extends _baseDto {
    public constructor(init?: Partial<AuthProviderConfigDto>) {
        super();
        this.type = DocType.AuthProviderConfig;
        Object.assign(this, init);
    }

    /**
     * Group membership for sync and ACL — must mirror the linked AuthProviderDto.memberOf.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public memberOf?: Uuid[];

    /**
     * The _id of the linked AuthProviderDto.
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public providerId!: string;

    /**
     * Custom namespace for JWT claims
     * e.g. https://yourdomain.com/metadata
     */
    @IsString()
    @IsOptional()
    @Expose()
    public claimNamespace?: string;

    /**
     * Mapping rules to determine a user's local groups from remote JWT information.
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuthProviderGroupMapping)
    @IsOptional()
    @Expose()
    public groupMappings?: AuthProviderGroupMapping[];

    /**
     * Override the standard OIDC claim paths used to identify a user.
     * Defaults: externalUserId → "sub", email → "email", name → "name"
     */
    @IsObject()
    @IsOptional()
    @Expose()
    public userFieldMappings?: {
        externalUserId?: string;
        email?: string;
        name?: string;
    };
}
