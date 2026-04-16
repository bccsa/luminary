import { DocType } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsObject,
    IsNumber,
    ValidateNested,
} from "class-validator";
import { Expose, Type } from "class-transformer";
import { ImageDto } from "./ImageDto";

/**
 */
export class AuthProviderDto extends _contentBaseDto {
    public constructor(init?: Partial<AuthProviderDto>) {
        super();
        this.type = DocType.AuthProvider;
        Object.assign(this, init);
    }

    /**
     * OIDC issuer domain (e.g. auth.example.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public domain: string;

    /**
     * API audience / resource identifier (e.g. https://api.example.com)
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public audience: string;

    /**
     * OIDC client ID
     */
    @IsString()
    @IsNotEmpty()
    @Expose()
    public clientId: string;

    @IsOptional()
    @IsObject()
    @Expose()
    public userFieldMappings?: {
        externalUserId?: string;
        email?: string;
        name?: string;
    };

    /** Display label shown in the login UI */
    @IsString()
    @IsOptional()
    @Expose()
    public label: string;

    /** Icon URL for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public icon: string;

    /** Background color for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public backgroundColor: string;

    /** Text color for the login button */
    @IsString()
    @IsOptional()
    @Expose()
    public textColor: string;

    /** Opacity of the icon (0–1) */
    @IsNumber()
    @IsOptional()
    @Expose()
    public iconOpacity: number;

    /** Storage bucket ID for the provider icon image */
    @IsString()
    @IsOptional()
    @Expose()
    public imageBucketId: string;

    /** Icon image data (processed via ImageEditor) */
    @IsOptional()
    @ValidateNested()
    @Type(() => ImageDto)
    @Expose()
    public imageData: ImageDto;
}
