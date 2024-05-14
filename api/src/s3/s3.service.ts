import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { S3Config } from "../configuration";

@Injectable()
export class S3Service {
    client: Minio.Client;

    constructor(private configService: ConfigService) {
        const s3Config = this.configService.get<S3Config>("s3");

        this.client = new Minio.Client({
            endPoint: s3Config.endpoint,
            port: s3Config.port,
            useSSL: s3Config.useSSL,
            accessKey: s3Config.accessKey,
            secretKey: s3Config.secretKey,
        });
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
}
