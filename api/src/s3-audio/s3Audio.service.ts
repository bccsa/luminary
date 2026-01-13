import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { AudioS3Config } from "../configuration";

@Injectable()
export class S3AudioService {
    client: Minio.Client;
    audioS3Config: AudioS3Config;

    constructor(private configService: ConfigService) {
        this.audioS3Config = this.configService.get<AudioS3Config>("s3Audio") || {
            endpoint: "localhost",
            port: 9000,
            useSSL: false,
            accessKey: "",
            secretKey: "",
            audioBucket: "",
        };

        // Only initialize client if we have valid configuration
        if (
            this.audioS3Config.endpoint &&
            this.audioS3Config.accessKey &&
            this.audioS3Config.secretKey
        ) {
            this.client = new Minio.Client({
                endPoint: this.audioS3Config.endpoint,
                port: this.audioS3Config.port,
                useSSL: this.audioS3Config.useSSL,
                accessKey: this.audioS3Config.accessKey,
                secretKey: this.audioS3Config.secretKey,
            });
        } else {
            // Create a dummy client that will fail gracefully when used
            // This allows the service to be instantiated even without S3 config
            this.client = new Minio.Client({
                endPoint: "localhost",
                port: 9000,
                useSSL: false,
                accessKey: "",
                secretKey: "",
            });
        }
    }

    /**
     * Get the public URL for an object in the audio bucket
     */
    public getAudioUrl(key: string): string {
        if (!this.audioBucket) {
            throw new Error("Audio bucket is not configured");
        }
        
        // Use S3_PUBLIC_ACCESS_URL if available, otherwise construct from endpoint
        const publicAccessUrl = process.env.S3_PUBLIC_ACCESS_URL;
        if (publicAccessUrl) {
            // Remove trailing slash if present
            const baseUrl = publicAccessUrl.replace(/\/$/, "");
            return `${baseUrl}/${this.audioBucket}/${key}`;
        }
        
        // Fallback to constructing URL from endpoint
        const schema = this.audioS3Config.useSSL ? "https" : "http";
        return `${schema}://${this.audioS3Config.endpoint}:${this.audioS3Config.port}/${this.audioBucket}/${key}`;
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
     * Check if the service is properly configured
     */
    private isConfigured(): boolean {
        return !!(
            this.audioS3Config &&
            this.audioS3Config.endpoint &&
            this.audioS3Config.endpoint !== "localhost" &&
            this.audioS3Config.accessKey &&
            this.audioS3Config.secretKey &&
            this.audioS3Config.audioBucket
        );
    }

    /**
     * Uploads a file to Audio S3 bucket
     */
    public async uploadFile(bucket: string, key: string, file: Buffer, mimetype: string) {
        if (!this.isConfigured()) {
            throw new Error(
                "S3 Audio service is not properly configured. Please set S3_MEDIA_ENDPOINT, S3_MEDIA_ACCESS_KEY, S3_MEDIA_SECRET_KEY, and S3_MEDIA_BUCKET (or use S3_* fallback variables).",
            );
        }
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
        // Treat connection as healthy only if the service is properly configured and the bucket exists.
        if (!this.isConfigured() || !this.audioBucket) return false;
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
