import { DocType, Uuid } from "../enums";
import { _baseDto } from "./_baseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    ValidateNested,
    IsArray,
    IsObject,
    IsNumber,
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

export class AuthProviderDto extends _baseDto {
    public constructor(init?: Partial<AuthProviderDto>) {
        super();
        this.type = DocType.AuthProvider;
        Object.assign(this, init);
    }

    /**
     * Group membership for sync and ACL.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public memberOf?: Uuid[];

    /**
     * OIDC issuer domain (e.g. auth.example.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public domain!: string;

    /**
     * API audience / resource identifier (e.g. https://api.example.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public audience!: string;

    /**
     * OIDC client ID
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public clientId!: string;

    /** Display label shown in the login UI */
    @IsString()
    @IsOptional()
    @Expose()
    public label!: string;

    /** Icon URL for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public icon!: string;

    /** Background color for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public backgroundColor!: string;

    /** Text color for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public textColor!: string;

    /** Opacity of the icon (0–1) */
    @IsNumber()
    @IsOptional()
    @Expose()
    public iconOpacity!: number;

    /** Storage bucket ID for the provider icon image */
    @IsString()
    @IsOptional()
    @Expose()
    public imageBucketId!: string;

    /** Icon image data (processed via ImageEditor) */
    @IsObject()
    @IsOptional()
    @Expose()
    public imageData!: Record<string, unknown>;
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
    public userFieldMappings?: { externalUserId?: string; email?: string; name?: string };
}
