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

    /** @deprecated */
    @IsOptional()
    @IsString()
    @Expose()
    userId?: string;

    @IsOptional()
    @IsNumber()
    @Expose()
    lastLogin?: number;

    @IsOptional()
    @IsString()
    @Expose()
    providerId?: string;

    @IsOptional()
    @IsString()
    @Expose()
    externalUserId?: string;
}
