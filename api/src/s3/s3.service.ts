import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { S3Config } from "../configuration";

@Injectable()
export class S3Service {
    client: Minio.Client;
    s3Config: S3Config;

    constructor(private configService: ConfigService) {
        this.s3Config = this.configService.get<S3Config>("s3");

        this.client = new Minio.Client({
            endPoint: this.s3Config.endpoint,
            port: this.s3Config.port,
            useSSL: this.s3Config.useSSL,
            accessKey: this.s3Config.accessKey,
            secretKey: this.s3Config.secretKey,
        });
    }

    /**
     * Get the configured image bucket name
     */
    public get imageBucket() {
        return this.s3Config.imageBucket;
    }

    /**
     * Override the configured image bucket name. This is useful for testing
     */
    public set imageBucket(bucket: string) {
        this.s3Config.imageBucket = bucket;
    }

    /**
     * Get the configured image quality
     */
    public get imageQuality() {
        return this.s3Config.imageQuality;
    }

    /**
     * Uploads a file to an S3 bucket
     */
    public async uploadFile(bucket: string, key: string, file: Buffer, mimetype: string) {
        const metadata = {
            "Content-Type": mimetype,
        };
        return this.client.putObject(bucket, key, file, file.length, metadata);
    }

    /**
     * Removes objects from a bucket
     */
    public async removeObjects(bucket: string, keys: string[]) {
        return this.client.removeObjects(bucket, keys);
    }

    /**
     * Get an object from a bucket
     */
    public async getObject(bucket: string, key: string) {
        return this.client.getObject(bucket, key);
    }

    /**
     * Checks if a bucket exists
     */
    public async bucketExists(bucket: string) {
        return this.client.bucketExists(bucket);
    }

    /**
     * Creates a bucket
     */
    public async makeBucket(bucket: string) {
        return this.client.makeBucket(bucket);
    }

    /**
     * Removes a bucket
     */
    public async removeBucket(bucket: string) {
        return this.client.removeBucket(bucket);
    }

    /**
     * Lists objects in a bucket
     */
    public async listObjects(bucket: string) {
        return this.client.listObjects(bucket);
    }

    /**
     * Check if the S3/Minio service is available
     */
    public async checkConnection(): Promise<boolean> {
        // Treat connection as healthy only if the configured image bucket exists.
        // If the bucket is missing or any error occurs, return false so the caller can react.
        if (!this.imageBucket) return false;
        try {
            return await this.client.bucketExists(this.imageBucket);
        } catch (_) {
            return false;
        }
    }

    /**
     * Check if an object exists in a bucket
     */
    public async objectExists(bucket: string, key: string): Promise<boolean> {
        try {
            await this.client.statObject(bucket, key);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate image upload and accessibility
     */
    public async validateImageUpload(
        bucket: string,
        key: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Check if bucket exists
            const bucketExists = await this.bucketExists(bucket);
            if (!bucketExists) {
                return { success: false, error: `Bucket '${bucket}' does not exist` };
            }

            // Try to get object info to verify it was uploaded successfully
            await this.client.statObject(bucket, key);

            return { success: true };
        } catch (error) {
            return { success: false, error: `Image validation failed: ${error.message}` };
        }
    }

    /**
     * Check if uploaded images are accessible
     */
    public async checkImageAccessibility(bucket: string, keys: string[]): Promise<string[]> {
        const inaccessibleImages: string[] = [];

        for (const key of keys) {
            try {
                await this.client.statObject(bucket, key);
            } catch (error) {
                inaccessibleImages.push(key);
            }
        }

        return inaccessibleImages;
    }

    /**
     * Check bucket connectivity with specific credentials
     */
    public async checkBucketConnectivity(
        credentials: {
            endpoint: string;
            accessKey: string;
            secretKey: string;
            port?: number;
            useSSL?: boolean;
        },
        bucketName: string,
    ): Promise<{
        status: "connected" | "unreachable" | "unauthorized" | "not-found";
        message?: string;
    }> {
        try {
            // Parse endpoint to extract host and determine SSL/port defaults
            const url = new URL(credentials.endpoint);
            const host = url.hostname;
            const port =
                credentials.port || parseInt(url.port) || (url.protocol === "https:" ? 443 : 80);
            const useSSL =
                credentials.useSSL !== undefined ? credentials.useSSL : url.protocol === "https:";

            const testClient = new Minio.Client({
                endPoint: host,
                port: port,
                useSSL: useSSL,
                accessKey: credentials.accessKey,
                secretKey: credentials.secretKey,
            });

            // Test if bucket exists and is accessible
            const bucketExists = await testClient.bucketExists(bucketName);

            if (bucketExists) {
                return { status: "connected" };
            } else {
                return {
                    status: "not-found",
                    message: `Bucket '${bucketName}' does not exist`,
                };
            }
        } catch (error) {
            // Check for specific error types
            if (
                error.message?.includes("Access Denied") ||
                error.message?.includes("SignatureDoesNotMatch")
            ) {
                return {
                    status: "unauthorized",
                    message: "Invalid credentials or insufficient permissions",
                };
            } else if (
                error.message?.includes("ENOTFOUND") ||
                error.message?.includes("ECONNREFUSED")
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
