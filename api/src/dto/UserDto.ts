import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * Database structured User object
 */
export class UserDto extends _contentBaseDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsNotEmpty()
    @IsString()
    name: string;
}
