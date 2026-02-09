import { IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { Auth0CredentialsDto } from "./Auth0CredentialsDto";
import { Uuid } from "../enums";

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
    @ValidateNested()
    @Type(() => Auth0CredentialsDto)
    @Expose()
    /**
     * Transient field for passing credentials during create/update operations.
     * Never stored directly in the database - use credential_id instead.
     */
    credential?: Auth0CredentialsDto;

    @IsOptional()
    @IsString()
    @Expose()
    /**
     * Reference to encrypted CryptoDto document containing Auth0CredentialsDto.
     * The credentials are encrypted using ENCRYPTION_KEY from the environment.
     */
    credential_id?: Uuid;
}
