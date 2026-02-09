import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * Auth0CredentialsDto represents Auth0 credentials that are intended to be serialized
 * and stored encrypted inside a `CryptoDto` document. This class
 * includes validation to ensure credential integrity before encryption.
 */
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
