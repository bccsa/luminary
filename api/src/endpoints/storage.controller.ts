import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { S3Service } from "../s3/s3.service";
import { DbService } from "../db/db.service";
import { validateApiVersion } from "../validation/apiVersion";
import { decrypt } from "../util/encryption";

export type BucketTestDto = {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucketName: string;
    apiVersion: string;
};

export type BucketTestResponseDto = {
    status: "success" | "error";
    message: string;
};

export type BucketStatusDto = {
    bucketId: string;
    apiVersion: string;
};

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

    @Post("bucket-status")
    @UseGuards(AuthGuard)
    async checkBucketStatus(@Body() body: BucketStatusDto): Promise<BucketStatusResponseDto> {
        await validateApiVersion(body.apiVersion);

        try {
            // Fetch the bucket document from the database
            const bucketResult = await this.dbService.getDoc(body.bucketId);

            if (!bucketResult.docs || bucketResult.docs.length === 0) {
                return {
                    status: "not-found",
                    message: `Bucket configuration not found: ${body.bucketId}`,
                };
            }

            const bucket = bucketResult.docs[0];

            // Get credentials - either embedded or from encrypted storage
            let credentials: {
                endpoint: string;
                bucketName: string;
                accessKey: string;
                secretKey: string;
            };

            if (bucket.credential) {
                // Embedded credentials (legacy or new buckets)
                credentials = {
                    endpoint: bucket.credential.endpoint,
                    bucketName: bucket.credential.bucketName,
                    accessKey: bucket.credential.accessKey,
                    secretKey: bucket.credential.secretKey,
                };
            } else if (bucket.credential_id) {
                // Encrypted credentials in separate document
                const encryptedStorageResult = await this.dbService.getDoc(bucket.credential_id);

                if (!encryptedStorageResult.docs || encryptedStorageResult.docs.length === 0) {
                    return {
                        status: "not-found",
                        message: `Credentials not found for bucket: ${bucket.name}`,
                    };
                }

                const encryptedStorage = encryptedStorageResult.docs[0];
                const decryptedBucketName = await decrypt(encryptedStorage.data.bucketName);
                const decryptedAccessKey = await decrypt(encryptedStorage.data.accessKey);
                const decryptedSecretKey = await decrypt(encryptedStorage.data.secretKey);

                credentials = {
                    endpoint: encryptedStorage.data.endpoint,
                    bucketName: decryptedBucketName,
                    accessKey: decryptedAccessKey,
                    secretKey: decryptedSecretKey,
                };
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
            return {
                status: "unreachable",
                message: `Error checking bucket status: ${error.message}`,
            };
        }
    }
}
