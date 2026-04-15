import { DocType, Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    IsObject,
    ValidateNested,
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
 * Per-provider JWT processing settings — one entry inside
 * `AuthProviderConfigDto.providers`, keyed by `AuthProviderDto.configId`.
 */
export class AuthProviderProviderConfig {
    /**
     * Groups granted access to this provider's JWT processing config entry.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    memberOf?: Uuid[];

    /**
     * Custom namespace for JWT claims (e.g. https://yourdomain.com/metadata).
     */
    @IsString()
    @IsOptional()
    @Expose()
    claimNamespace?: string;

    /**
     * Mapping rules that derive a user's local groups from remote JWT claims.
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AuthProviderGroupMapping)
    @IsOptional()
    @Expose()
    groupMappings?: AuthProviderGroupMapping[];

    /**
     * Override the standard OIDC claim paths used to identify a user.
     * Defaults: externalUserId → "sub", email → "email", name → "name".
     */
    @IsObject()
    @IsOptional()
    @Expose()
    userFieldMappings?: {
        externalUserId?: string;
        email?: string;
        name?: string;
    };
}

/**
 * Singleton document holding sensitive JWT processing settings for every auth
 * provider on the platform.
 *
 * The `_id` is fixed to `"authProviderConfig"` and `memberOf` is locked to
 * `["group-super-admins"]` by `processAuthProviderConfigDto`, so only
 * super-admins can view or edit it. Per-provider entries live under
 * `providers`, keyed by `AuthProviderDto.configId`.
 */
export class AuthProviderConfigDto extends _contentBaseDto {
    public constructor(init?: Partial<AuthProviderConfigDto>) {
        super();
        this.type = DocType.AuthProviderConfig;
        Object.assign(this, init);
    }

    /**
     * Map of per-provider JWT processing settings, keyed by
     * `AuthProviderDto.configId`.
     */
    @IsObject()
    @Expose()
    public providers!: Record<string, AuthProviderProviderConfig>;
}
