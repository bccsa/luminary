import { Injectable, Inject } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { DbService } from "../db/db.service";
import { S3Service } from "../s3/s3.service";
import { processJwt } from "../jwt/processJwt";
import { S3BucketDto } from "../dto/S3BucketDto";
import { EncryptedStorageDto } from "../dto/EncryptedStorageDto";
import { decrypt } from "../util/encryption";
import { BucketStatusResponseDto } from "./storage.controller";

@Injectable()
export class StorageService {
    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private readonly dbService: DbService,
        private readonly s3Service: S3Service,
    ) {}

    async checkBucketStatus(bucketId: string, token: string): Promise<BucketStatusResponseDto> {
        try {
            // Validate user token
            await processJwt(token, this.dbService, this.logger);

            // Get bucket document
            const bucketResult = await this.dbService.getDoc(bucketId);
            if (bucketResult.docs.length === 0) {
                return {
                    bucketId,
                    status: "not-found",
                    message: "Bucket document not found",
                };
            }

            const bucket = bucketResult.docs[0] as S3BucketDto;

            // Extract credentials
            let credentials: {
                endpoint: string;
                accessKey: string;
                secretKey: string;
                port?: number;
                useSSL?: boolean;
            };

            if (bucket.credential) {
                // Use embedded credentials
                credentials = {
                    endpoint: bucket.credential.endpoint,
                    accessKey: bucket.credential.accessKey,
                    secretKey: bucket.credential.secretKey,
                };
            } else if (bucket.credential_id) {
                // Get encrypted credentials
                const credResult = await this.dbService.getDoc(bucket.credential_id);
                if (credResult.docs.length === 0) {
                    return {
                        bucketId,
                        status: "no-credentials",
                        message: "Referenced credential document not found",
                    };
                }

                const encryptedStorage = credResult.docs[0] as EncryptedStorageDto;

                // Decrypt credentials
                const decryptedAccessKey = await decrypt(encryptedStorage.data.accessKey);
                const decryptedSecretKey = await decrypt(encryptedStorage.data.secretKey);

                credentials = {
                    endpoint: encryptedStorage.data.endpoint,
                    accessKey: decryptedAccessKey,
                    secretKey: decryptedSecretKey,
                };
            } else {
                return {
                    bucketId,
                    status: "no-credentials",
                    message: "No credentials configured for bucket",
                };
            }

            // Test bucket connectivity
            const connectivityResult = await this.s3Service.checkBucketConnectivity(
                credentials,
                bucket.name,
            );

            return {
                bucketId,
                status: connectivityResult.status,
                message: connectivityResult.message,
            };
        } catch (error) {
            this.logger.error(`Error checking bucket status for ${bucketId}:`, error);
            return {
                bucketId,
                status: "unreachable",
                message: `Error checking bucket: ${error.message}`,
            };
        }
    }
}
