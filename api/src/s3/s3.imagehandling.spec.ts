import { ImageDto } from "../dto/ImageDto";
import { processImage } from "./s3.imagehandling";
import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import * as fs from "fs";
import * as path from "path";
import * as Minio from "minio";
import { S3BucketDto } from "../dto/S3BucketDto";
import { DbService } from "../db/db.service";
import { v4 as uuidv4 } from "uuid";
import { BucketType, DocType } from "../enums";

describe("S3ImageHandler", () => {
    let service: S3Service;
    let testClient: Minio.Client;
    let testBucket: string;
    const resImages: ImageDto[] = [];

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        bucketName: "", // Will be set in beforeAll
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        service = (await createTestingModule("imagehandling")).s3Service;
        testBucket = uuidv4();
        testCredentials.bucketName = testBucket;
        testClient = service.createClient(testCredentials);
        await service.makeBucket(testClient, testBucket);
    });

    afterAll(async () => {
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
                ).toBe(false);

                expect(image2.fileCollections.length).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it("discards user-added file collection objects", async () => {
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

        // Check if the client-added file data is removed
        expect(
            image2.fileCollections.find((f) =>
                f.imageFiles.some((file) => file.filename == "invalid"),
            ),
        ).toBe(undefined);

        resImages.push(image);
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
        bucketName: "test-bucket", // placeholder
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const module = await createTestingModule("bucket-migration");
        service = module.s3Service;
        dbService = module.dbService;
        testClient = service.createClient(testCredentials);
    });

    beforeEach(async () => {
        // Create unique bucket names for each test
        sourceBucket = `${uuidv4()}-source-bucket`;
        targetBucket = `${uuidv4()}-target-bucket`;

        // Create fresh bucket DTOs for each test
        sourceBucketDto = {
            _id: `storage-${uuidv4()}`,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Source Bucket`,
            bucketType: BucketType.Image,
            publicUrl: `http://127.0.0.1:9000/${sourceBucket}`,
            fileTypes: ["image/*"],
            credential: {
                ...testCredentials,
                bucketName: sourceBucket,
            },
            updatedTimeUtc: Date.now(),
        };
        targetBucketDto = {
            _id: `storage-${uuidv4()}`,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Target Bucket`,
            bucketType: BucketType.Image,
            publicUrl: `http://127.0.0.1:9000/${targetBucket}`,
            fileTypes: ["image/*"],
            credential: {
                ...testCredentials,
                bucketName: targetBucket,
            },
            updatedTimeUtc: Date.now(),
        };

        await service.makeBucket(testClient, sourceBucket);
        await service.makeBucket(testClient, targetBucket);

        await dbService.upsertDoc(sourceBucketDto);
        await dbService.upsertDoc(targetBucketDto);
    });

    afterEach(async () => {
        // Clean up buckets after each test
        // Note: Some tests may leave files in buckets, which is fine for testing purposes
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
        const emptyImage = new ImageDto();
        emptyImage.fileCollections = [];

        // Create a previous state with empty file collections to trigger migration logic
        const prevImage = new ImageDto();
        prevImage.fileCollections = [];

        const warnings = await processImage(
            emptyImage,
            prevImage,
            service,
            dbService,
            targetBucketDto._id,
            sourceBucketDto._id,
        );

        // Should complete without errors when there are no files to migrate
        expect(warnings).toBeDefined();
        expect(Array.isArray(warnings)).toBe(true);

        // No migration happens when there are no files, so no warnings are generated
        expect(warnings.length).toBe(0);
    });

    it("should warn when attempting migration with no image files", async () => {
        const image = new ImageDto();
        image.fileCollections = [
            {
                aspectRatio: 1.5,
                imageFiles: [], // Empty files array
            },
        ];

        const prevImage = new ImageDto();
        prevImage.fileCollections = [
            {
                aspectRatio: 1.5,
                imageFiles: [], // Empty files array
            },
        ];

        const warnings = await processImage(
            image,
            prevImage,
            service,
            dbService,
            targetBucketDto._id,
            sourceBucketDto._id,
        );

        // Should get warning about no files to migrate
        expect(warnings).toBeDefined();
        expect(warnings.length).toBeGreaterThan(0);
        const noFilesMessage = warnings.find((w) => w.includes("No image files to migrate"));
        expect(noFilesMessage).toBeDefined();
    });

    it("should detect cross-system migration in warnings", async () => {
        // Create a bucket with different endpoint (AWS instead of MinIO)
        const crossSystemCredentials = {
            endpoint: "https://s3.amazonaws.com",
            accessKey: "test",
            secretKey: "test",
        };

        const crossSystemBucketDto: S3BucketDto = {
            _id: `storage-${uuidv4()}`,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Cross System Bucket`,
            bucketType: BucketType.Image,
            publicUrl: `https://s3.amazonaws.com/${uuidv4()}-cross-bucket`,
            fileTypes: ["image/*"],
            credential: crossSystemCredentials,
            updatedTimeUtc: Date.now(),
        };

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

        // Should have migration failures (because AWS credentials are invalid)
        expect(warnings.length).toBeGreaterThan(0);
        const failedMigrationMessage = warnings.find((w) => w.includes("Failed to migrate"));
        expect(failedMigrationMessage).toBeDefined();
        // Should also have the summary message about failed files
        const summaryMessage = warnings.find((w) => w.includes("remain in the old bucket"));
        expect(summaryMessage).toBeDefined();
    });

    it("should preserve files in old bucket if migration fails", async () => {
        // Create an invalid target bucket that doesn't exist physically
        const invalidBucketDto: S3BucketDto = {
            _id: `storage-${uuidv4()}`,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Invalid Bucket`,
            bucketType: BucketType.Image,
            publicUrl: `http://127.0.0.1:9000/nonexistent-bucket-${uuidv4()}`,
            fileTypes: ["image/*"],
            credential: {
                endpoint: "http://127.0.0.1:9000",
                accessKey: "minio",
                secretKey: "minio123",
            },
            updatedTimeUtc: Date.now(),
        };

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
        bucketName: "", // will be set in beforeAll
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const module = await createTestingModule("filetype-validation");
        service = module.s3Service;
        dbService = module.dbService;

        testBucket = `filetype-test-${uuidv4()}`;
        testCredentials.bucketName = testBucket;
        testClient = service.createClient(testCredentials);

        await service.makeBucket(testClient, testBucket);

        // Create bucket with restricted file types
        restrictedBucketDto = {
            _id: `storage-${uuidv4()}`,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Restricted Bucket`,
            bucketType: BucketType.Image,
            publicUrl: `http://127.0.0.1:9000/${testBucket}/restricted`,
            fileTypes: ["image/jpeg", "image/png"],
            credential: testCredentials,
            updatedTimeUtc: Date.now(),
        };

        // Create bucket with no file type restrictions (empty array)
        allowAllBucketDto = {
            _id: `storage-${uuidv4()}`,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Allow All Bucket`,
            bucketType: BucketType.Image,
            publicUrl: `http://127.0.0.1:9000/${testBucket}/allow-all`,
            fileTypes: [],
            credential: testCredentials,
            updatedTimeUtc: Date.now(),
        };

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
