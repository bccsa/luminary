import { DocType, Uuid } from "../enums";
import { _baseDto } from "./_baseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    IsObject,
    IsNumber,
} from "class-validator";
import { Expose } from "class-transformer";

export class AuthProviderDto extends _baseDto {
    public constructor(init?: Partial<AuthProviderDto>) {
        super();
        this.type = DocType.AuthProvider;
        Object.assign(this, init);
    }

    /**
     * Group membership for sync and ACL.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    public memberOf?: Uuid[];

    /**
     * OIDC issuer domain (e.g. auth.example.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public domain!: string;

    /**
     * API audience / resource identifier (e.g. https://api.example.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public audience!: string;

    /**
     * OIDC client ID
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public clientId!: string;

    /** Display label shown in the login UI */
    @IsString()
    @IsOptional()
    @Expose()
    public label!: string;

    /** Icon URL for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public icon!: string;

    /** Background color for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public backgroundColor!: string;

    /** Text color for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public textColor!: string;

    /** Opacity of the icon (0–1) */
    @IsNumber()
    @IsOptional()
    @Expose()
    public iconOpacity!: number;

    /** Storage bucket ID for the provider icon image */
    @IsString()
    @IsOptional()
    @Expose()
    public imageBucketId!: string;

    /** Icon image data (processed via ImageEditor) */
    @IsObject()
    @IsOptional()
    @Expose()
    public imageData!: Record<string, unknown>;
}
