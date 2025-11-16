import {
    Controller,
    Get,
    Query,
    UseGuards,
    Headers,
    HttpException,
    HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { S3Service } from "../s3/s3.service";
import { DbService } from "../db/db.service";
import { validateApiVersion } from "../validation/apiVersion";
import { retrieveCryptoData } from "../util/encryption";
import { S3CredentialDto } from "../dto/S3CredentialDto";
import { processJwt } from "../jwt/processJwt";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType } from "../enums";

export type BucketStatusResponseDto = {
    status: "connected" | "unreachable" | "unauthorized" | "not-found" | "no-credentials";
    message?: string;
};

@Controller("storage")
export class StorageController {
    constructor(
        private readonly s3Service: S3Service,
        private readonly dbService: DbService,
    ) {}

    @Get("storagestatus")
    @UseGuards(AuthGuard)
    async getStorageStatus(
        @Query("bucketId") bucketId: string,
        @Query("apiVersion") apiVersion: string,
        @Headers("Authorization") authHeader: string,
    ): Promise<BucketStatusResponseDto> {
        await validateApiVersion(apiVersion);

        // Extract and process JWT token
        const token = authHeader?.replace("Bearer ", "") ?? "";
        if (!token) {
            throw new HttpException("Authorization token required", HttpStatus.UNAUTHORIZED);
        }

        const userDetails = await processJwt(token, this.dbService, undefined);

        // Validate bucketId parameter
        if (!bucketId) {
            throw new HttpException("bucketId query parameter is required", HttpStatus.BAD_REQUEST);
        }

        try {
            // Fetch the bucket document from the database
            const bucketResult = await this.dbService.getDoc(bucketId);

            if (!bucketResult.docs || bucketResult.docs.length === 0) {
                return {
                    status: "not-found",
                    message: `Bucket configuration not found: ${bucketId}`,
                };
            }

            const bucket = bucketResult.docs[0];

            // Check if user has view permission for this bucket
            const hasPermission = PermissionSystem.verifyAccess(
                bucket.memberOf,
                DocType.Storage,
                AclPermission.View,
                userDetails.groups,
            );

            if (!hasPermission) {
                throw new HttpException(
                    "Insufficient permissions to view this bucket",
                    HttpStatus.FORBIDDEN,
                );
            }

            // Get credentials - either embedded or from encrypted storage
            let credentials: {
                endpoint: string;
                bucketName: string;
                accessKey: string;
                secretKey: string;
            };

            if (bucket.credential) {
                // Embedded credentials
                credentials = {
                    endpoint: bucket.credential.endpoint,
                    bucketName: bucket.credential.bucketName,
                    accessKey: bucket.credential.accessKey,
                    secretKey: bucket.credential.secretKey,
                };
            } else if (bucket.credential_id) {
                // Encrypted credentials in separate document
                try {
                    const decrypted = await retrieveCryptoData<S3CredentialDto>(
                        this.dbService,
                        bucket.credential_id,
                    );

                    credentials = {
                        endpoint: decrypted.endpoint,
                        bucketName: decrypted.bucketName,
                        accessKey: decrypted.accessKey,
                        secretKey: decrypted.secretKey,
                    };
                } catch (err) {
                    return {
                        status: "not-found",
                        message: `Credentials not found for bucket: ${bucket.name}`,
                    };
                }
            } else {
                return {
                    status: "no-credentials",
                    message: `No credentials configured for bucket: ${bucket.name}`,
                };
            }

            // Use S3Service method to check bucket connectivity
            const result = await this.s3Service.checkBucketConnectivity(credentials);

            return result;
        } catch (error) {
            // Handle HttpExceptions (permission errors, etc.)
            if (error instanceof HttpException) {
                throw error;
            }

            return {
                status: "unreachable",
                message: `Error checking bucket status: ${error.message}`,
            };
        }
    }
}
