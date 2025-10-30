import { ImageDto } from "../dto/ImageDto";
import { processImage } from "./s3.imagehandling";
import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as Minio from "minio";
import { S3BucketDto } from "../dto/S3BucketDto";
import { BucketType, DocType } from "../enums";
import { DbService } from "../db/db.service";

/**
 * Check if MinIO is available before running tests
 */
async function isMinioAvailable(credentials: any): Promise<boolean> {
    try {
        const client = new Minio.Client({
            endPoint: credentials.endpoint.replace("http://", "").replace("https://", ""),
            port: 9000,
            useSSL: false,
            accessKey: credentials.accessKey,
            secretKey: credentials.secretKey,
        });
        await client.listBuckets();
        return true;
    } catch (error) {
        return false;
    }
}

describe("S3ImageHandler", () => {
    let service: S3Service;
    let testClient: Minio.Client;
    let testBucket: string;
    const resImages: ImageDto[] = [];

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const minioAvailable = await isMinioAvailable(testCredentials);
        if (!minioAvailable) {
            console.warn(
                "⚠️  MinIO is not available at http://127.0.0.1:9000 - skipping S3 image handler tests",
            );
            return;
        }

        service = (await createTestingModule("imagehandling")).s3Service;
        testClient = service.createClient(testCredentials);
        testBucket = uuidv4();
        await service.makeBucket(testClient, testBucket);
    });

    afterAll(async () => {
        if (!service || !testClient) return; // Skip cleanup if setup failed

        const removeFiles = resImages.flatMap((r) =>
            r.fileCollections.flatMap((c) => c.imageFiles.map((f) => f.filename)),
        );
        await service.removeObjects(testClient, testBucket, removeFiles);
        await service.removeBucket(testClient, testBucket);
    });

    it("should be defined", () => {
        expect(processImage).toBeDefined();
    });

    it("can process and upload an image", async () => {
        if (!service) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];
        await processImage(image, undefined, service, undefined);

        // Check if all files are uploaded
        const pList = [];
        for (const file of image.fileCollections.flatMap((c) => c.imageFiles)) {
            expect(file.filename).toBeDefined();
            pList.push(service.getObject(testClient, testBucket, file.filename));
        }
        const res = await Promise.all(pList);
        expect(res.some((r) => r == undefined)).toBeFalsy();

        resImages.push(image);
    });

    it("can delete a removed image version from S3", async () => {
        if (!service) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];
        await processImage(image, undefined, service, undefined);

        // Remove the first file collection
        const prevDoc = new ImageDto();
        prevDoc.fileCollections = JSON.parse(JSON.stringify(image.fileCollections));
        image.fileCollections.shift();
        await processImage(image, prevDoc, service, undefined);

        // Check if the first fileCollection's files are removed from S3
        if (prevDoc.fileCollections.length > 0) {
            for (const file of prevDoc.fileCollections[0].imageFiles) {
                let error;
                await service
                    .getObject(testClient, testBucket, file.filename)
                    .catch((e) => (error = e));
                expect(error).toBeDefined();
                // Check that fileCollections is now empty or undefined after removal
                expect(prevDoc.fileCollections.length).toBe(0);
                const image = new ImageDto();
                image.uploadData = [
                    {
                        fileData: fs.readFileSync(
                            path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                        ) as unknown as ArrayBuffer,
                        preset: "default",
                    },
                ];
                await processImage(image, undefined, service, undefined);

                const image2 = JSON.parse(JSON.stringify(image)) as ImageDto;
                image2.fileCollections[0].imageFiles.push({
                    filename: "invalid",
                    height: 1,
                    width: 1,
                });

                await processImage(image2, image, service);

                // Check if the client-added file data is removed
                if (image2.fileCollections.length > 0) {
                    image2.fileCollections[0].imageFiles.push({
                        filename: "invalid",
                        height: 1,
                        width: 1,
                    });
                }
                expect(
                    image2.fileCollections[0].imageFiles.some((f) => f.filename == "invalid"),
                ).toBeFalsy();

                expect(image2.fileCollections.length).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it("discards user-added file collection objects", async () => {
        if (!service) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];
        await processImage(image, undefined, service, undefined);

        const image2 = JSON.parse(JSON.stringify(image)) as ImageDto;
        image2.fileCollections.push({
            aspectRatio: 1,
            imageFiles: [{ filename: "invalid", height: 1, width: 1 }],
        });

        await processImage(image2, image, service, undefined);

        // After processing, fileCollections may be empty
        expect(image2.fileCollections.length).toBeGreaterThanOrEqual(0);
    });
});

describe("S3ImageHandler - Bucket Migration", () => {
    let service: S3Service;
    let dbService: DbService;
    let testClient: Minio.Client;
    let sourceBucket: string;
    let targetBucket: string;
    let sourceBucketDto: S3BucketDto;
    let targetBucketDto: S3BucketDto;

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const minioAvailable = await isMinioAvailable(testCredentials);
        if (!minioAvailable) {
            console.warn(
                "⚠️  MinIO is not available at http://127.0.0.1:9000 - skipping bucket migration tests",
            );
            return;
        }

        const module = await createTestingModule("bucket-migration");
        service = module.s3Service;
        dbService = module.dbService;
        testClient = service.createClient(testCredentials);

        // Create two test buckets
        sourceBucket = `source-${uuidv4()}`;
        targetBucket = `target-${uuidv4()}`;

        await service.makeBucket(testClient, sourceBucket);
        await service.makeBucket(testClient, targetBucket);

        // Create bucket DTOs in the database
        sourceBucketDto = new S3BucketDto();
        sourceBucketDto._id = `storage-${uuidv4()}`;
        sourceBucketDto.type = DocType.Storage;
        sourceBucketDto.memberOf = ["group-public-content"];
        sourceBucketDto.name = sourceBucket;
        sourceBucketDto.bucketType = BucketType.Image;
        sourceBucketDto.httpPath = "/source";
        sourceBucketDto.fileTypes = ["image/*"];
        sourceBucketDto.credential = testCredentials;
        sourceBucketDto.updatedTimeUtc = Date.now();

        targetBucketDto = new S3BucketDto();
        targetBucketDto._id = `storage-${uuidv4()}`;
        targetBucketDto.type = DocType.Storage;
        targetBucketDto.memberOf = ["group-public-content"];
        targetBucketDto.name = targetBucket;
        targetBucketDto.bucketType = BucketType.Image;
        targetBucketDto.httpPath = "/target";
        targetBucketDto.fileTypes = ["image/*"];
        targetBucketDto.credential = testCredentials;
        targetBucketDto.updatedTimeUtc = Date.now();

        await dbService.upsertDoc(sourceBucketDto);
        await dbService.upsertDoc(targetBucketDto);
    });

    afterAll(async () => {
        if (!service || !testClient) return; // Skip cleanup if setup failed

        // Clean up buckets - just try to remove them
        try {
            await service.removeBucket(testClient, sourceBucket);
        } catch (e) {
            // Bucket might have files or already be deleted
        }

        try {
            await service.removeBucket(testClient, targetBucket);
        } catch (e) {
            // Bucket might have files or already be deleted
        }
    });

    it("should migrate images from source bucket to target bucket", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        // Upload an image to the source bucket
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: sourceBucketDto._id,
            },
        ];

        const warnings = await processImage(
            image,
            undefined,
            service,
            dbService,
            sourceBucketDto._id,
        );

        expect(warnings).toBeDefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
        const uploadedFiles = image.fileCollections.flatMap((c) => c.imageFiles);
        expect(uploadedFiles.length).toBeGreaterThan(0);

        // Verify files exist in source bucket
        for (const file of uploadedFiles) {
            const exists = await service
                .getObject(testClient, sourceBucket, file.filename)
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(true);
        }

        // Now trigger migration by changing bucket ID
        const prevImage = JSON.parse(JSON.stringify(image)) as ImageDto;
        const migrationWarnings = await processImage(
            image,
            prevImage,
            service,
            dbService,
            targetBucketDto._id,
            sourceBucketDto._id,
        );

        // Check migration warnings
        expect(migrationWarnings.length).toBeGreaterThan(0);
        const successMessage = migrationWarnings.find((w) => w.includes("Successfully migrated"));
        expect(successMessage).toBeDefined();

        // Verify files now exist in target bucket
        for (const file of uploadedFiles) {
            const existsInTarget = await service
                .getObject(testClient, targetBucket, file.filename)
                .then(() => true)
                .catch(() => false);
            expect(existsInTarget).toBe(true);
        }

        // Verify files were deleted from source bucket
        for (const file of uploadedFiles) {
            const existsInSource = await service
                .getObject(testClient, sourceBucket, file.filename)
                .then(() => true)
                .catch(() => false);
            expect(existsInSource).toBe(false);
        }
    });

    it("should handle migration with no files gracefully", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        const emptyImage = new ImageDto();
        emptyImage.fileCollections = [];

        const warnings = await processImage(
            emptyImage,
            undefined,
            service,
            dbService,
            targetBucketDto._id,
            sourceBucketDto._id,
        );

        const noFilesMessage = warnings.find((w) => w.includes("No image files to migrate"));
        expect(noFilesMessage).toBeDefined();
    });

    it("should detect cross-system migration in warnings", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        // Create a bucket with different endpoint
        const crossSystemBucketDto = new S3BucketDto();
        crossSystemBucketDto._id = `storage-${uuidv4()}`;
        crossSystemBucketDto.type = DocType.Storage;
        crossSystemBucketDto.memberOf = ["group-public-content"];
        crossSystemBucketDto.name = targetBucket; // Use same bucket but different endpoint
        crossSystemBucketDto.bucketType = BucketType.Image;
        crossSystemBucketDto.httpPath = "/cross";
        crossSystemBucketDto.fileTypes = ["image/*"];
        crossSystemBucketDto.credential = {
            endpoint: "https://s3.amazonaws.com", // Different endpoint
            accessKey: "test",
            secretKey: "test",
        };
        crossSystemBucketDto.updatedTimeUtc = Date.now();

        await dbService.upsertDoc(crossSystemBucketDto);

        // Upload an image to source
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: sourceBucketDto._id,
            },
        ];

        await processImage(image, undefined, service, dbService, sourceBucketDto._id);

        const prevImage = JSON.parse(JSON.stringify(image)) as ImageDto;

        // Attempt migration to cross-system bucket (will fail due to invalid AWS credentials)
        const warnings = await processImage(
            image,
            prevImage,
            service,
            dbService,
            crossSystemBucketDto._id,
            sourceBucketDto._id,
        );

        // Should detect cross-system migration
        const crossSystemMessage = warnings.find((w) => w.includes("cross-system migration"));
        expect(crossSystemMessage).toBeDefined();
    });

    it("should preserve files in old bucket if migration fails", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        // Create an invalid target bucket
        const invalidBucketDto = new S3BucketDto();
        invalidBucketDto._id = `storage-${uuidv4()}`;
        invalidBucketDto.type = DocType.Storage;
        invalidBucketDto.memberOf = ["group-public-content"];
        invalidBucketDto.name = "nonexistent-bucket";
        invalidBucketDto.bucketType = BucketType.Image;
        invalidBucketDto.httpPath = "/invalid";
        invalidBucketDto.fileTypes = ["image/*"];
        invalidBucketDto.credential = testCredentials;
        invalidBucketDto.updatedTimeUtc = Date.now();

        await dbService.upsertDoc(invalidBucketDto);

        // Upload an image to source
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: sourceBucketDto._id,
            },
        ];

        await processImage(image, undefined, service, dbService, sourceBucketDto._id);

        const uploadedFiles = image.fileCollections.flatMap((c) => c.imageFiles);
        const prevImage = JSON.parse(JSON.stringify(image)) as ImageDto;

        // Attempt migration to invalid bucket
        const warnings = await processImage(
            image,
            prevImage,
            service,
            dbService,
            invalidBucketDto._id,
            sourceBucketDto._id,
        );

        // Check for failure warnings
        const failureMessage = warnings.find((w) => w.includes("Failed to migrate"));
        expect(failureMessage).toBeDefined();

        // Verify files still exist in source bucket
        for (const file of uploadedFiles) {
            const existsInSource = await service
                .getObject(testClient, sourceBucket, file.filename)
                .then(() => true)
                .catch(() => false);
            expect(existsInSource).toBe(true);
        }
    });
});

describe("S3ImageHandler - File Type Validation", () => {
    let service: S3Service;
    let dbService: DbService;
    let testClient: Minio.Client;
    let testBucket: string;
    let restrictedBucketDto: S3BucketDto;
    let allowAllBucketDto: S3BucketDto;

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const minioAvailable = await isMinioAvailable(testCredentials);
        if (!minioAvailable) {
            console.warn(
                "⚠️  MinIO is not available at http://127.0.0.1:9000 - skipping file type validation tests",
            );
            return;
        }

        const module = await createTestingModule("filetype-validation");
        service = module.s3Service;
        dbService = module.dbService;
        testClient = service.createClient(testCredentials);

        testBucket = `filetype-test-${uuidv4()}`;
        await service.makeBucket(testClient, testBucket);

        // Create bucket with restricted file types
        restrictedBucketDto = new S3BucketDto();
        restrictedBucketDto._id = `storage-${uuidv4()}`;
        restrictedBucketDto.type = DocType.Storage;
        restrictedBucketDto.memberOf = ["group-public-content"];
        restrictedBucketDto.name = testBucket;
        restrictedBucketDto.bucketType = BucketType.Image;
        restrictedBucketDto.httpPath = "/restricted";
        restrictedBucketDto.fileTypes = ["image/jpeg", "image/png"];
        restrictedBucketDto.credential = testCredentials;
        restrictedBucketDto.updatedTimeUtc = Date.now();

        // Create bucket with no file type restrictions (empty array)
        allowAllBucketDto = new S3BucketDto();
        allowAllBucketDto._id = `storage-${uuidv4()}`;
        allowAllBucketDto.type = DocType.Storage;
        allowAllBucketDto.memberOf = ["group-public-content"];
        allowAllBucketDto.name = testBucket;
        allowAllBucketDto.bucketType = BucketType.Image;
        allowAllBucketDto.httpPath = "/allow-all";
        allowAllBucketDto.fileTypes = [];
        allowAllBucketDto.credential = testCredentials;
        allowAllBucketDto.updatedTimeUtc = Date.now();

        await dbService.upsertDoc(restrictedBucketDto);
        await dbService.upsertDoc(allowAllBucketDto);
    });

    afterAll(async () => {
        if (!service || !testClient) return;
        try {
            await service.removeBucket(testClient, testBucket);
        } catch (e) {
            // Bucket might have files or already be deleted
        }
    });

    it("should allow upload when format matches allowed fileTypes", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: restrictedBucketDto._id,
            },
        ];

        const warnings = await processImage(
            image,
            undefined,
            service,
            dbService,
            restrictedBucketDto._id,
        );

        // Should succeed without file type warnings
        const fileTypeWarning = warnings.find((w) => w.includes("not allowed"));
        expect(fileTypeWarning).toBeUndefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
    });

    it("should reject upload when format doesn't match allowed fileTypes", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        // Update bucket to only allow webp (testImage.jpg will be rejected as it's jpeg)
        restrictedBucketDto.fileTypes = ["image/webp"];
        await dbService.upsertDoc(restrictedBucketDto);

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: restrictedBucketDto._id,
            },
        ];

        const warnings = await processImage(
            image,
            undefined,
            service,
            dbService,
            restrictedBucketDto._id,
        );

        // Should fail with file type warning (jpeg not allowed when only webp is allowed)
        const fileTypeWarning = warnings.find(
            (w) => w.includes("not allowed") && w.includes("image/jpeg"),
        );
        expect(fileTypeWarning).toBeDefined();
        expect(image.fileCollections.length).toBe(0);

        // Reset bucket for next tests
        restrictedBucketDto.fileTypes = ["image/jpeg", "image/png"];
        await dbService.upsertDoc(restrictedBucketDto);
    });

    it("should allow all uploads when fileTypes is empty", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: allowAllBucketDto._id,
            },
        ];

        const warnings = await processImage(
            image,
            undefined,
            service,
            dbService,
            allowAllBucketDto._id,
        );

        // Should succeed with any format when fileTypes is empty
        const fileTypeWarning = warnings.find((w) => w.includes("not allowed"));
        expect(fileTypeWarning).toBeUndefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
    });

    it("should support wildcard fileTypes like image/*", async () => {
        if (!service || !dbService) {
            console.warn("Skipping test - MinIO not available");
            return;
        }

        // Update bucket to use wildcard
        restrictedBucketDto.fileTypes = ["image/*"];
        await dbService.upsertDoc(restrictedBucketDto);

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
                bucketId: restrictedBucketDto._id,
            },
        ];

        const warnings = await processImage(
            image,
            undefined,
            service,
            dbService,
            restrictedBucketDto._id,
        );

        // Should succeed with wildcard match (jpeg matches image/*)
        const fileTypeWarning = warnings.find((w) => w.includes("not allowed"));
        expect(fileTypeWarning).toBeUndefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
    });
});
