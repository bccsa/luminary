import { IsArray, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";

export class ProviderIdentifierDto {
    @IsString()
    @Expose()
    providerId: string;

    @IsString()
    @Expose()
    userId: string;
}

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

    /**
     * IDs of OAuthProvider documents this user belongs to.
     * Used for CMS display and "add on login" linking.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    providers?: string[];

    /**
     * One entry per provider: the external user ID within that provider.
     * Used for identity lookup via $elemMatch: { providerId, userId }.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProviderIdentifierDto)
    @Expose()
    providerIdentifiers?: ProviderIdentifierDto[];
}
