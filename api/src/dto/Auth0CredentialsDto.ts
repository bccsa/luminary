import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * Payload stored encrypted in a CryptoDto document. Only the secret is encrypted;
 * public config (domain, clientId, audience) lives on OAuthProviderDto.
 */
export class Auth0CredentialSecretsDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    clientSecret: string;
}

/** Transient input for create/update. Public fields go on OAuthProviderDto; only clientSecret is encrypted. */
export class Auth0CredentialsDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    domain: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    clientId: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    clientSecret: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    audience: string;
}
