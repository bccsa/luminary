import { Controller, Get, Query, UseGuards, Req, HttpException, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { DbService } from "../db/db.service";
import { validateApiVersion } from "../validation/apiVersion";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType } from "../enums";
import { retrieveCryptoData } from "../util/encryption";
import { FastifyRequest } from "fastify";

export type MediaKeyResponseDto = {
    /** AES-128 key as 32 hex characters, as the player expects it. */
    keyHex: string;
};

/**
 * Hands a viewer the decryption key for one media collection.
 *
 * Encrypted HLS is encrypted at rest in the bucket, so a player cannot decode a
 * segment without the key. The key is stored as a crypto object and is never
 * replicated to clients — documents carry only `hlsKey_id`, which is an id and
 * not a secret. Without an endpoint like this one, encrypted media is
 * undecryptable by every client, which is where this started.
 *
 * This is key *delivery*, not access control over the media itself: anything a
 * viewer may watch, they may also be handed the key for. The permission checked
 * is therefore exactly the one that decides whether they may see the document —
 * `View` on the parent Post or Tag — and no other. Anything stricter would deny
 * the key for content already on the viewer's screen; anything looser would
 * hand out keys for content they cannot see.
 *
 * The key is as recoverable as the media is watchable, and no more: it protects
 * bytes sitting in a public bucket from being played by whoever finds the URL.
 * It is not DRM, and nothing here pretends a determined viewer cannot keep it.
 */
@Controller("media")
export class MediaKeyController {
    constructor(private readonly dbService: DbService) {}

    @Get("key")
    @UseGuards(AuthGuard)
    async getMediaKey(
        @Query("docId") docId: string,
        @Query("apiVersion") apiVersion: string,
        @Req() request: FastifyRequest,
    ): Promise<MediaKeyResponseDto> {
        await validateApiVersion(apiVersion);

        const userDetails = request.user;

        if (!docId) {
            throw new HttpException("docId query parameter is required", HttpStatus.BAD_REQUEST);
        }

        const result = await this.dbService.getDoc(docId);
        if (!result.docs || result.docs.length === 0) {
            throw new HttpException(`Document not found: ${docId}`, HttpStatus.NOT_FOUND);
        }

        const doc = result.docs[0];

        // A content document mirrors its parent's media as `parentMedia`, and is
        // what a player is rendering; the parent Post or Tag carries it as
        // `media`. Both are accepted so a caller does not have to know which one
        // it is holding.
        const media = doc.parentMedia ?? doc.media;

        // The permission lives on the parent type even when the document asked
        // for is a content document — content is not separately permissioned,
        // which is why `memberOf` is copied down onto it.
        const parentType: DocType =
            doc.type === DocType.Content ? (doc.parentType ?? DocType.Post) : doc.type;

        const hasPermission = PermissionSystem.verifyAccess(
            doc.memberOf ?? [],
            parentType,
            AclPermission.View,
            userDetails.groups,
        );

        // Deliberately the same 404 a missing document gets. Distinguishing them
        // would turn this endpoint into a probe for which documents exist, and
        // the caller has nothing useful to do with the difference.
        if (!hasPermission) {
            throw new HttpException(`Document not found: ${docId}`, HttpStatus.NOT_FOUND);
        }

        if (!media?.hlsKey_id) {
            throw new HttpException(
                `No encryption key is stored for this media: ${docId}`,
                HttpStatus.NOT_FOUND,
            );
        }

        let keyHex: string;
        try {
            keyHex = await retrieveCryptoData<string>(this.dbService, media.hlsKey_id);
        } catch {
            // Unreadable rather than absent: a rotated ENCRYPTION_KEY, or a
            // crypto document that has gone. Neither is the caller's to fix, and
            // neither means "no key was ever set".
            throw new HttpException(
                "The stored encryption key could not be read",
                HttpStatus.CONFLICT,
            );
        }

        if (!keyHex) {
            throw new HttpException(
                "The stored encryption key is empty",
                HttpStatus.CONFLICT,
            );
        }

        return { keyHex };
    }
}
