import { DocType } from "../enums";
import { _baseDto } from "./_baseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    ValidateNested,
    IsArray,
    IsObject,
    IsNumber,
    IsBoolean,
} from "class-validator";
import { Expose, Type } from "class-transformer";

export class AuthProviderClaimMapping {
    @IsString()
    @IsNotEmpty()
    @Expose()
    claim!: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    target!: string;
}

export class AuthProviderCondition {
    @IsString()
    @IsNotEmpty()
    @Expose()
    type!: "always" | "authenticated" | "claimEquals" | "claimIn";

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
     * Auth0 Domain issuer (e.g. bccsa.eu.auth0.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public domain!: string;

    /**
     * Auth0 Audience (e.g. https://api.bccsa.org)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public audience!: string;

    /**
     * Auth0 Client ID
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public clientId!: string;

    /**
     * Custom namespace for JWT claims
     * e.g. https://yourdomain.com/metadata
     */
    @IsString()
    @IsOptional()
    @Expose()
    public claimNamespace!: string;

    /**
     * Mapping rules to determine a user's local groups from remote JWT information
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuthProviderGroupMapping)
    @IsOptional()
    @Expose()
    public groupMappings!: AuthProviderGroupMapping[];

    /**
     * Mapping rules to populate local user fields directly from JWT claims
     */
    @IsObject()
    @IsOptional()
    @Expose()
    public userFieldMappings!: {
        [userFieldName: string]: string; // Mapping standard internal fields to jwt payload paths
    };

    /**
     * Mapping rules for JWT claim fields to system concepts (e.g. "hasMembership" → "groups")
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuthProviderClaimMapping)
    @IsOptional()
    @Expose()
    public claimMappings!: AuthProviderClaimMapping[];

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
