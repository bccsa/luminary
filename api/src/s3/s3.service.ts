import { Injectable } from "@nestjs/common";
import * as Minio from "minio";
import { S3CredentialDto } from "../dto/S3CredentialDto";

@Injectable()
export class S3Service {
    // Note: No default client or config - everything is bucket-specific now

    constructor() {
        // No configuration needed - each bucket provides its own credentials
    }

    /**
     * Creates a Minio client with specific credentials
     */
    public createClient(credentials: {
        endpoint: string;
        bucketName: string;
        accessKey: string;
        secretKey: string;
        port?: number;
        useSSL?: boolean;
    }): Minio.Client {
        // Parse endpoint to extract host and determine SSL/port defaults
        const url = new URL(credentials.endpoint);
        const host = url.hostname;
        const port =
            credentials.port || parseInt(url.port) || (url.protocol === "https:" ? 443 : 80);
        const useSSL =
            credentials.useSSL !== undefined ? credentials.useSSL : url.protocol === "https:";

        const clientConfig: any = {
            endPoint: host,
            port: port,
            useSSL: useSSL,
            accessKey: credentials.accessKey,
            secretKey: credentials.secretKey,
            region: "auto",
        };

        return new Minio.Client(clientConfig);
    }

    /**
     * Uploads a file to an S3 bucket using specific credentials
     */
    public async uploadFile(
        client: Minio.Client,
        bucket: string,
        key: string,
        file: Buffer,
        mimetype: string,
    ) {
        const metadata = {
            "Content-Type": mimetype,
        };
        return client.putObject(bucket, key, file, file.length, metadata);
    }

    /**
     * Removes objects from a bucket using specific credentials
     */
    public async removeObjects(client: Minio.Client, bucket: string, keys: string[]) {
        return client.removeObjects(bucket, keys);
    }

    /**
     * Get an object from a bucket using specific credentials
     */
    public async getObject(client: Minio.Client, bucket: string, key: string) {
        return client.getObject(bucket, key);
    }

    /**
     * Checks if a bucket exists using specific credentials
     */
    public async bucketExists(client: Minio.Client, bucket: string) {
        return client.bucketExists(bucket);
    }

    /**
     * Creates a bucket using specific credentials
     */
    public async makeBucket(client: Minio.Client, bucket: string) {
        return client.makeBucket(bucket);
    }

    /**
     * Removes a bucket using specific credentials
     */
    public async removeBucket(client: Minio.Client, bucket: string) {
        return client.removeBucket(bucket);
    }

    /**
     * Lists objects in a bucket using specific credentials
     */
    public async listObjects(client: Minio.Client, bucket: string) {
        return client.listObjects(bucket);
    }

    /**
     * Check if an S3 service is reachable using specific credentials
     */
    public async checkConnection(client: Minio.Client): Promise<boolean> {
        // Check if S3 service is reachable by attempting to list buckets
        try {
            await client.listBuckets();
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Check if an object exists in a bucket using specific credentials
     */
    public async objectExists(client: Minio.Client, bucket: string, key: string): Promise<boolean> {
        try {
            await client.statObject(bucket, key);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate image upload and accessibility using specific credentials
     */
    public async validateImageUpload(
        client: Minio.Client,
        bucket: string,
        key: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Check if bucket exists
            const bucketExists = await client.bucketExists(bucket);
            if (!bucketExists) {
                return { success: false, error: `Bucket '${bucket}' does not exist` };
            }

            // Try to get object info to verify it was uploaded successfully
            await client.statObject(bucket, key);

            return { success: true };
        } catch (error) {
            return { success: false, error: `Image validation failed: ${error.message}` };
        }
    }

    /**
     * Check if uploaded images are accessible using specific credentials
     */
    public async checkImageAccessibility(
        client: Minio.Client,
        bucket: string,
        keys: string[],
    ): Promise<string[]> {
        const inaccessibleImages: string[] = [];

        for (const key of keys) {
            try {
                await client.statObject(bucket, key);
            } catch (error) {
                inaccessibleImages.push(key);
            }
        }

        return inaccessibleImages;
    }

    /**
     * Creates an S3 client from a bucket configuration stored in the database
     * Handles both embedded credentials and encrypted credential references
     */
    public async createClientFromBucket(
        bucketId: string,
        db: any, // DbService type
    ): Promise<{ client: Minio.Client; bucketName: string }> {
        const { retrieveCryptoData } = await import("../util/encryption");

        // Get bucket configuration
        const result = await db.getDoc(bucketId);
        if (!result.docs || result.docs.length === 0) {
            throw new Error(`Bucket with ID ${bucketId} not found`);
        }

        const bucket = result.docs[0];

        let credentials: {
            endpoint: string;
            bucketName: string;
            accessKey: string;
            secretKey: string;
        };

        if (bucket.credential) {
            // Use embedded credentials
            credentials = {
                endpoint: bucket.credential.endpoint,
                bucketName: bucket.credential.bucketName!,
                accessKey: bucket.credential.accessKey!,
                secretKey: bucket.credential.secretKey!,
            };
        } else if (bucket.credential_id) {
            // Use reference to encrypted credentials
            const decrypted = await retrieveCryptoData<S3CredentialDto>(db, bucket.credential_id);
            credentials = {
                endpoint: decrypted.endpoint,
                bucketName: decrypted.bucketName!,
                accessKey: decrypted.accessKey!,
                secretKey: decrypted.secretKey!,
            };
        } else {
            throw new Error("No credentials configured for bucket");
        }

        return {
            client: this.createClient(credentials),
            bucketName: credentials.bucketName,
        };
    }

    /**
     * Check bucket connectivity with specific credentials
     */
    public async checkBucketConnectivity(credentials: {
        endpoint: string;
        bucketName: string;
        accessKey: string;
        secretKey: string;
        port?: number;
        useSSL?: boolean;
    }): Promise<{
        status: "connected" | "unreachable" | "unauthorized" | "not-found" | "no-credentials";
        message?: string;
    }> {
        try {
            const testClient = this.createClient(credentials);

            // Check if the specific bucket exists (works for all S3-compatible services)
            const exists = await testClient.bucketExists(credentials.bucketName);
            if (!exists) {
                console.log(
                    `Bucket '${credentials.bucketName}' does not exist on the storage provider.`,
                );
                return {
                    status: "not-found",
                    message: `Bucket '${credentials.bucketName}' does not exist`,
                };
            }

            return { status: "connected" };
        } catch (error) {
            // Check for specific error types
            if (
                error.message?.includes("Access Denied") ||
                error.message?.includes("SignatureDoesNotMatch") ||
                error.message?.includes("InvalidAccessKeyId") ||
                error.message?.includes("Forbidden") ||
                error.code === "SignatureDoesNotMatch" ||
                error.code === "InvalidAccessKeyId" ||
                error.code === "AccessDenied"
            ) {
                return {
                    status: "unauthorized",
                    message: "Invalid credentials or insufficient permissions",
                };
            } else if (
                error.message?.includes("ENOTFOUND") ||
                error.message?.includes("ECONNREFUSED") ||
                error.message?.includes("EHOSTUNREACH")
            ) {
                return {
                    status: "unreachable",
                    message: "Cannot connect to S3 endpoint",
                };
            } else {
                return {
                    status: "unreachable",
                    message: error.message || "Unknown connection error",
                };
            }
        }
    }
}
