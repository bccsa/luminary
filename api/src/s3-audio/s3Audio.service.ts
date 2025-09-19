import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { AudioS3Config } from "src/configuration";

@Injectable()
export class S3AudioService {
    client: Minio.Client;
    audioS3Config: AudioS3Config;

    constructor(private configService: ConfigService) {
        this.audioS3Config = this.configService.get<AudioS3Config>("s3-audio");

        this.client = new Minio.Client({
            endPoint: this.audioS3Config.endpoint,
            port: this.audioS3Config.port,
            useSSL: this.audioS3Config.useSSL,
            accessKey: this.audioS3Config.accessKey,
            secretKey: this.audioS3Config.secretKey,
        });
    }

    /**
     * Get the configured audio bucket name
     */
    public get audioBucket() {
        return this.audioS3Config.audioBucket;
    }

    /**
     * Override the configured image bucket name. This is useful for testing
     */
    public set audioBucket(bucket: string) {
        this.audioS3Config.audioBucket = bucket;
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
        if (!this.audioBucket) return false;
        try {
            return await this.client.bucketExists(this.audioBucket);
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
     * Validate audio upload accessibility
     */
    public async validateAudioUpload(
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
            return { success: false, error: `Audio validation failed: ${error.message}` };
        }
    }

    /**
     * Check if uploaded audios are accessible
     */
    public async checkAudioAccessibility(bucket: string, keys: string[]): Promise<string[]> {
        const inaccessibleAudios: string[] = [];

        for (const key of keys) {
            try {
                await this.client.statObject(bucket, key);
            } catch (error) {
                inaccessibleAudios.push(key);
            }
        }

        return inaccessibleAudios;
    }
}
