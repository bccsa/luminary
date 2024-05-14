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
        return this.client.putObject(bucket, key, file, Buffer.byteLength(file), metadata);
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
}
