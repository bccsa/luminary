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
import { processJwt } from "../jwt/processJwt";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType } from "../enums";

export type StorageStatusResponseDto = {
    status: "connected" | "unreachable" | "unauthorized" | "not-found" | "no-credentials";
    message?: string;
};

@Controller("storage")
export class StorageStatusController {
    constructor(private readonly dbService: DbService) {}

    @Get("storagestatus")
    @UseGuards(AuthGuard)
    async getStorageStatus(
        @Query("bucketId") bucketId: string,
        @Query("apiVersion") apiVersion: string,
        @Headers("Authorization") authHeader: string,
    ): Promise<StorageStatusResponseDto> {
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

            // Verify bucket has credentials configured
            if (!bucket.credential_id) {
                return {
                    status: "no-credentials",
                    message: `No credentials configured for bucket: ${bucket.name}`,
                };
            }

            // Create S3Service instance for this bucket
            const s3Service = await S3Service.create(bucketId, this.dbService);

            // Use S3Service method to check bucket connectivity
            const result = await s3Service.checkBucketConnectivity();

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
