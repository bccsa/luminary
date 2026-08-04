import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "src/enums";

/**
 * Database structured Media object
 */
export class MediaDto {
    @IsString()
    @Expose()
    hlsUrl: string;

    /**
     * ID to the CryptoObject where the (optional) encryption key is stored
     */
    @IsOptional()
    @IsString()
    @Expose()
    hlsKey_id?: Uuid;

    /**
     * Optional field for submitting an HLS encryption key for a newly added HLS URL.
     * When set, this key is stored as a crypto object, and the crypto object ID is
     * exposed as the hlsKey_id.
     */
    @IsOptional()
    @IsString()
    @Expose({ toClassOnly: true })
    hlsKey?: string;
}
