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
     * External user ID for mapping to external systems
     */
    @IsOptional()
    @IsString()
    @Expose()
    userId?: string;

    @IsOptional()
    @IsNumber()
    @Expose()
    lastLogin?: number;
}
