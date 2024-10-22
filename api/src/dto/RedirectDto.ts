import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { RedirectType } from "src/enums";

export class RedirectDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsEnum(RedirectType)
    @Expose()
    redirectType: RedirectType;

    @IsString()
    @IsNotEmpty()
    @Expose()
    fromSlug: string;

    @IsString()
    @IsOptional()
    @Expose()
    toSlug?: string;

    @IsString()
    @IsOptional()
    @Expose()
    toUrl?: string;
}
