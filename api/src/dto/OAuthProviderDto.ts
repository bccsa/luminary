import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from "class-validator";
import { Expose } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { Uuid } from "../enums";
import { ImageDto } from "./ImageDto";

/** Condition for group assignment (AND semantics). */
export type GroupAssignmentCondition =
    | { type: "always" }
    | { type: "authenticated" }
    | { type: "claimEquals"; claimPath: string; value: string }
    | { type: "claimIn"; claimPath: string; values: string[] };

export type GroupAssignment = {
    groupId: string;
    conditions: GroupAssignmentCondition[];
};

export type UserFieldMappings = {
    userId?: string;
    email?: string;
    name?: string;
};

/**
 * OAuthProviderDto represents an OAuth provider configuration.
 * Currently supports Auth0, with a clean structure for future providers.
 * Credentials are stored encrypted via credential_id reference.
 */
export class OAuthProviderDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    label: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    providerType: "auth0";

    @IsOptional()
    @IsString()
    @Expose()
    textColor?: string;

    @IsOptional()
    @IsString()
    @Expose()
    backgroundColor?: string;

    @IsOptional()
    @IsString()
    @Expose()
    clientId?: string;

    @IsOptional()
    @IsString()
    @Expose()
    domain?: string;

    @IsOptional()
    @IsString()
    @Expose()
    audience?: string;

    @IsOptional()
    @IsString()
    @Expose()
    icon?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    @Expose()
    /** Icon opacity 0–1; applied when displaying the icon. */
    iconOpacity?: number;

    @IsOptional()
    @Expose()
    /**
     * Image data for the provider icon.
     */
    imageData?: ImageDto;

    @IsOptional()
    @IsString()
    @Expose()
    /**
     * Bucket ID where images are stored.
     */
    imageBucketId?: Uuid;

    @IsOptional()
    @IsString()
    @Expose()
    /**
     * Custom claim namespace configured in the Auth0 tenant's Actions/Rules.
     * Used to extract user details (userId, email, name) from the JWT payload.
     * e.g. "https://your-tenant.com/metadata"
     */
    claimNamespace?: string;

    @IsOptional()
    @Expose()
    /**
     * Generic claim-to-system-concept mappings.
     * Each entry maps a JWT claim field to a system target.
     * e.g. [{ claim: "groups", target: "groups" }]
     * or   [{ claim: "hasMembership", target: "groups" }]
     */
    claimMappings?: Array<{ claim: string; target: string }>;

    @IsOptional()
    @Expose()
    /**
     * Field names inside claimNamespace for userId, email, name.
     */
    userFieldMappings?: UserFieldMappings;

    @IsOptional()
    @Expose()
    /**
     * Assign groups when all conditions pass (AND). Invalid groupIds are no-ops.
     */
    groupAssignments?: GroupAssignment[];

    @IsOptional()
    @IsBoolean()
    @Expose()
    /**
     * When true, used for no-JWT (guest) and excluded from domain match when JWT present.
     */
    isGuestProvider?: boolean;
}
