import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose } from "class-transformer";

/**
 * Database structured User object
 */
export class UserDto extends _contentBaseDto {
    @IsEmail()
    @IsNotEmpty()
    @Expose()
    email: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    name: string;

    /**
     * External user ID within the OAuth provider (e.g. Auth0 sub)
     */
    @IsOptional()
    @IsString()
    @Expose()
    userId?: string;

    /**
     * The _id of the OAuthProvider document that authenticated this user.
     * Combined with userId, forms a unique compound key for identity resolution.
     */
    @IsOptional()
    @IsString()
    @Expose()
    oAuthProviderId?: string;

    @IsOptional()
    @IsNumber()
    @Expose()
    lastLogin?: number;
}
