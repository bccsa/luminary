import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsBoolean, IsOptional, IsString } from "class-validator";
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

    /**
     * Write-only: the user asked, in the delete confirmation, for the files in
     * storage to go with the document.
     *
     * Carried on the document rather than as a separate call because a delete *is*
     * a change request — the whole document arrives with `deleteReq` set, so the
     * intent travels with the thing it applies to and cannot be separated from it
     * in flight. Never persisted, like `hlsKey` above.
     */
    @IsOptional()
    @IsBoolean()
    @Expose({ toClassOnly: true })
    deleteFiles?: boolean;
}
