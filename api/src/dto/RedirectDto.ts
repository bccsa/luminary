import { RedirectType } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class RedirectDto extends _contentBaseDto {
    //TODO RedirectType field here
    @IsNotEmpty()
    @IsEnum(RedirectType)
    @Expose()
    redirectType: RedirectType;

    @IsString()
    @IsNotEmpty()
    @Expose()
    slug: string;

    @IsString()
    @IsOptional()
    @Expose()
    toSlug?: string;
}
