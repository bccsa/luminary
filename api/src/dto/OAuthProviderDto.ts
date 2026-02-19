import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { Auth0CredentialsDto } from "./Auth0CredentialsDto";
import { Uuid } from "../enums";
import { ImageDto } from "./ImageDto";

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
    @ValidateNested()
    @Type(() => Auth0CredentialsDto)
    @Expose()
    /**
     * Transient field for passing credentials during create/update operations.
     * Public fields (domain, clientId, audience) are stored on this doc; only
     * clientSecret is encrypted and stored via credential_id.
     */
    credential?: Auth0CredentialsDto;

    @IsOptional()
    @IsString()
    @Expose()
    /**
     * Reference to encrypted CryptoDto document containing only the clientSecret.
     * Public config (domain, clientId, audience) is stored on this document.
     */
    credential_id?: Uuid;
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
}
