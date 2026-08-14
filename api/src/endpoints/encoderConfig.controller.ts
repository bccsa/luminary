import { Controller, Get, Query, UseGuards, Req, HttpException, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { DbService } from "../db/db.service";
import { validateApiVersion } from "../validation/apiVersion";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType } from "../enums";
import { S3CredentialDto } from "../dto/S3CredentialDto";
import { retrieveCryptoData } from "../util/encryption";
import { FastifyRequest } from "fastify";

/**
 * Everything the local media encoder needs to write a collection to a bucket and
 * to publish a URL for it. Shaped for the encoder's `POST /api/cms/sessions` body
 * rather than for our own storage model, so the CMS forwards it without reshaping.
 */
export type EncoderConfigResponseDto = {
    s3: {
        endPoint: string;
        port: number;
        useSSL: boolean;
        bucket: string;
        accessKey: string;
        secretKey: string;
    };
    publicBaseUrl: string;
};

/**
 * Hands out the S3 credentials for a media bucket.
 *
 * The encoder runs on the editor's own machine and uploads straight to the bucket,
 * so it needs real credentials — there is no path where the server does the upload
 * on its behalf. Credentials are stored encrypted and are not replicated to
 * clients, which is why they are fetched here rather than read off the Storage
 * document the CMS already holds.
 *
 * Gated on `Assign` rather than `View`: assigning a bucket is the right to publish
 * into it, which is exactly what these credentials confer. `View` is what the
 * status endpoint needs to render a connectivity dot, and is held far more widely.
 */
@Controller("storage")
export class EncoderConfigController {
    constructor(private readonly dbService: DbService) {}

    @Get("encoderconfig")
    @UseGuards(AuthGuard)
    async getEncoderConfig(
        @Query("bucketId") bucketId: string,
        @Query("apiVersion") apiVersion: string,
        @Req() request: FastifyRequest,
    ): Promise<EncoderConfigResponseDto> {
        await validateApiVersion(apiVersion);

        const userDetails = request.user;

        if (!bucketId) {
            throw new HttpException("bucketId query parameter is required", HttpStatus.BAD_REQUEST);
        }

        const bucketResult = await this.dbService.getDoc(bucketId);
        if (!bucketResult.docs || bucketResult.docs.length === 0) {
            throw new HttpException(
                `Bucket configuration not found: ${bucketId}`,
                HttpStatus.NOT_FOUND,
            );
        }

        const bucket = bucketResult.docs[0];

        const hasPermission = PermissionSystem.verifyAccess(
            bucket.memberOf,
            DocType.Storage,
            AclPermission.Assign,
            userDetails.groups,
        );

        if (!hasPermission) {
            throw new HttpException(
                "Insufficient permissions to encode to this bucket",
                HttpStatus.FORBIDDEN,
            );
        }

        if (!bucket.credential_id) {
            throw new HttpException(
                `No credentials configured for bucket: ${bucket.name}`,
                HttpStatus.CONFLICT,
            );
        }

        if (!bucket.publicUrl) {
            throw new HttpException(
                `No public URL configured for bucket: ${bucket.name}. The encoder needs one to ` +
                    "publish a playable address for the collection it writes.",
                HttpStatus.CONFLICT,
            );
        }

        const credentials = await retrieveCryptoData<S3CredentialDto>(
            this.dbService,
            bucket.credential_id,
        );

        if (!credentials?.accessKey || !credentials?.secretKey || !credentials?.bucketName) {
            throw new HttpException(
                `Stored credentials for bucket ${bucket.name} are incomplete`,
                HttpStatus.CONFLICT,
            );
        }

        // The encoder takes host, port and TLS as separate fields; we store one URL.
        // Split the same way S3Service does, so both reach the same endpoint.
        const url = new URL(credentials.endpoint);
        const useSSL = url.protocol === "https:";

        return {
            s3: {
                endPoint: url.hostname,
                port: parseInt(url.port) || (useSSL ? 443 : 80),
                useSSL,
                bucket: credentials.bucketName,
                accessKey: credentials.accessKey,
                secretKey: credentials.secretKey,
            },
            publicBaseUrl: bucket.publicUrl,
        };
    }
}
