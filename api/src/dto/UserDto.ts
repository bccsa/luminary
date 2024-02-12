import { IsArray, IsEmail, IsNotEmpty } from "class-validator";
import { DocType, Uuid } from "../types";

/**
 * Database structured User object
 */
export class UserDto {
    @IsNotEmpty()
    _id: Uuid;
    @IsNotEmpty()
    type: DocType.User;
    @IsArray()
    memberOf: Uuid[];
    @IsEmail()
    email: string;
    @IsNotEmpty()
    name: string;
}
