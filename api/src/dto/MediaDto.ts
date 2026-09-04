import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsBoolean, IsOptional, IsString, Matches } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "src/enums";

/**
 * Database structured Media object
 */
export class MediaDto {
    /** Optional: a document need not have media, and media need not have a URL yet. */
    @IsOptional()
    @IsString()
    @Expose()
    hlsUrl?: string;

    /**
     * ID of the sidecar document holding this collection's (optional) decryption key.
     * The key itself is never on this document — clients fetch it from GET /sidecar.
     */
    @IsOptional()
    @IsString()
    @Expose()
    hlsKey_id?: Uuid;

    /**
     * Write-only: an encryption key submitted with a newly added HLS URL. Stored as a
     * masked sidecar and dropped before the document is written, so it never rests here.
     */
    @IsOptional()
    @IsString()
    @Matches(/^[0-9a-f]{32}$/i, { message: "hlsKey must be a 32-character hex string (AES-128)" })
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
