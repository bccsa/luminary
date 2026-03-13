import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";

export class UserIdentityDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    providerId!: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    externalUserId!: string;
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
     * @deprecated Use identities[] instead. Kept for backwards compatibility.
     */
    @IsOptional()
    @IsString()
    @Expose()
    userId?: string;

    @IsOptional()
    @IsNumber()
    @Expose()
    lastLogin?: number;

    /**
     * Array of linked external identities across auth providers.
     * Each entry links a providerId to the external user ID (e.g. Auth0 sub).
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserIdentityDto)
    @Expose()
    identities?: UserIdentityDto[];
}
