import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { S3MediaConfig } from "../configuration";

@Injectable()
export class S3MediaService {
    client: Minio.Client;
    mediaS3Config: S3MediaConfig;

    constructor(private configService: ConfigService) {
        this.mediaS3Config = this.configService.get<S3MediaConfig>("s3Media");

        this.client = new Minio.Client({
            endPoint: this.mediaS3Config.endpoint,
            port: this.mediaS3Config.port,
            useSSL: this.mediaS3Config.useSSL,
            accessKey: this.mediaS3Config.accessKey,
            secretKey: this.mediaS3Config.secretKey,
        });
    }

    /**
     * Get the public URL for an object in the media bucket
     */
    public getMediaUrl(key: string): string {
        if (!this.mediaBucket) {
            throw new Error("Media bucket is not configured");
        }
        const schema = this.mediaS3Config.useSSL ? "https" : "http";
        return `${schema}://${this.mediaS3Config.endpoint}:${this.mediaS3Config.port}/${this.mediaBucket}/${key}`;
    }

    /**
     * Get the configured media bucket name
     */
    public get mediaBucket() {
        return this.mediaS3Config.mediaBucket;
    }

    /**
     * Override the configured image bucket name. This is useful for testing
     */
    public set mediaBucket(bucket: string) {
        this.mediaS3Config.mediaBucket = bucket;
    }

    /**
     * Uploads a file to Media S3 bucket
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
     * Check if a bucket exists
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
     * List objects in a bucket
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
        if (!this.mediaBucket) return false;
        try {
            return await this.client.bucketExists(this.mediaBucket);
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
     * Validate media upload accessibility
     */
    public async validateMediaUpload(
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
            return { success: false, error: `Media validation failed: ${error.message}` };
        }
    }

    /**
     * Check if uploaded medias are accessible
     */
    public async checkMediaAccessibility(bucket: string, keys: string[]): Promise<string[]> {
        const inaccessibleMedias: string[] = [];

        for (const key of keys) {
            try {
                await this.client.statObject(bucket, key);
            } catch (error) {
                inaccessibleMedias.push(key);
            }
        }

        return inaccessibleMedias;
    }
}
