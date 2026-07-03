import { RedirectType } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class RedirectDto extends _contentBaseDto {
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

    /**
     * Server-authoritative trigram FTS index (`"trigram:tf"` entries) over slug + toSlug,
     * powering the strict server-side `/fts` search. Set by `processRedirectDto`; clients
     * must not set it.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    fts?: string[];
}
