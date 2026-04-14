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

/**
 * A single rule evaluated against a user's JWT to decide whether a group mapping applies.
 */
export class AuthProviderCondition {
    /**
     * The kind of check to perform:
     * - `authenticated`: matches any successfully authenticated user.
     * - `claimEquals`: matches when the claim at `claimPath` equals `value`.
     * - `claimIn`: matches when the claim at `claimPath` is contained in `values`.
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    type!: "authenticated" | "claimEquals" | "claimIn";

    /**
     * Dot-notation path to the JWT claim being inspected (e.g. `realm_access.roles`).
     * Required for `claimEquals` and `claimIn`.
     */
    @IsOptional()
    @IsString()
    @Expose()
    claimPath?: string;

    /**
     * Expected claim value for `claimEquals`.
     */
    @IsOptional()
    @Expose()
    value?: string | string[];

    /**
     * Allowed claim values for `claimIn` — matches if the claim equals any entry,
     * or (for array claims) if any element of the claim is in this list.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    values?: string[];
}

/**
 * Maps a remote JWT shape to a local group: if all `conditions` pass for an
 * incoming user, they are granted membership in `groupId`.
 */
export class AuthProviderGroupMapping {
    /**
     * The _id of the local group to assign when all conditions match.
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    groupId!: string;

    /**
     * Conditions evaluated with AND semantics — every condition must pass for
     * the mapping to apply.
     */
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
