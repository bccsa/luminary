import { ImageDto } from "../../dto/ImageDto";
import { processImage } from "./processImageDto";
import { S3Service } from "../../s3/s3.service";
import { createTestingModule } from "../../test/testingModule";
import * as fs from "fs";
import * as path from "path";
import { StorageDto } from "../../dto/StorageDto";
import { DbService } from "../../db/db.service";
import { v4 as uuidv4 } from "uuid";
import { StorageType, DocType } from "../../enums";
import { storeCryptoData } from "../../util/encryption";

describe("S3ImageHandler", () => {
    let service: S3Service;
    let dbService: DbService;
    let testBucket: string;
    let testBucketId: string;
    const resImages: ImageDto[] = [];

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        bucketName: "", // Will be set in beforeAll
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const module = await createTestingModule("imagehandling");
        dbService = module.dbService;
        testBucket = uuidv4();
        testBucketId = `test-bucket-${uuidv4()}`;
        testCredentials.bucketName = testBucket;

        // Create encrypted credentials for the test bucket
        const encryptedCredId = await storeCryptoData(dbService, testCredentials);

        // Create a bucket document
        const bucketDoc = {
            _id: testBucketId,
            type: DocType.Storage,
            name: "Test Bucket",
            mimeTypes: ["image/*"],
            publicUrl: `http://127.0.0.1:9000/${testBucket}`,
            StorageType: StorageType.Image,
            credential_id: encryptedCredId,
        };

        await dbService.upsertDoc(bucketDoc);

        // Create S3Service instance using the new API
        service = await S3Service.create(testBucketId, dbService);

        // Create the test bucket
        await service.makeBucket();
    });

    afterAll(async () => {
        const removeFiles = resImages.flatMap((r) =>
            r.fileCollections.flatMap((c) => c.imageFiles.map((f) => f.filename)),
        );
        if (removeFiles.length > 0) {
            await service.removeObjects(removeFiles);
        }
        await service.removeBucket();
        S3Service.clearCache();
    });

    it("should be defined", () => {
        expect(processImage).toBeDefined();
    });

    it("can process and upload an image", async () => {
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];
        await processImage(image, undefined, dbService, testBucketId);

        // Check if all files are uploaded
        const pList = [];
        for (const file of image.fileCollections.flatMap((c) => c.imageFiles)) {
            expect(file.filename).toBeDefined();
            pList.push(service.getObject(file.filename));
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
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];
        await processImage(image, undefined, dbService, testBucketId);

        // Remove the first file collection
        const prevDoc = new ImageDto();
        prevDoc.fileCollections = JSON.parse(JSON.stringify(image.fileCollections));
        const removedFiles = prevDoc.fileCollections[0]?.imageFiles || [];
        image.fileCollections.shift();

        await processImage(image, prevDoc, dbService, testBucketId);

        // Check if the first fileCollection's files are removed from S3
        if (removedFiles.length > 0) {
            for (const file of removedFiles) {
                let error;
                await service.getObject(file.filename).catch((e) => (error = e));

                expect(error).toBeDefined();
            }

            // Check that image.fileCollections no longer contains the removed collection
            expect(image.fileCollections.length).toBeLessThan(prevDoc.fileCollections.length);
        }
    });

    it("discards user-added file collection objects", async () => {
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];
        await processImage(image, undefined, dbService, testBucketId);

        const image2 = JSON.parse(JSON.stringify(image)) as ImageDto;
        image2.fileCollections.push({
            aspectRatio: 1,
            imageFiles: [{ filename: "invalid", height: 1, width: 1 }],
        });

        await processImage(image2, image, dbService, testBucketId);

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
    let dbService: DbService;
    let sourceBucket: string;
    let targetBucket: string;
    let sourceBucketId: string;
    let targetBucketId: string;
    let sourceBucketDto: StorageDto;
    let targetBucketDto: StorageDto;
    let sourceService: S3Service;
    let targetService: S3Service;

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        bucketName: "test-bucket", // placeholder
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const module = await createTestingModule("bucket-migration");
        dbService = module.dbService;
    });

    beforeEach(async () => {
        // Create unique bucket names for each test
        sourceBucket = `${uuidv4()}-source-bucket`;
        targetBucket = `${uuidv4()}-target-bucket`;
        sourceBucketId = `storage-${uuidv4()}`;
        targetBucketId = `storage-${uuidv4()}`;

        // Create encrypted credentials for source bucket
        const sourceCredId = await storeCryptoData(dbService, {
            ...testCredentials,
            bucketName: sourceBucket,
        });

        // Create encrypted credentials for target bucket
        const targetCredId = await storeCryptoData(dbService, {
            ...testCredentials,
            bucketName: targetBucket,
        });

        // Create fresh bucket DTOs for each test
        sourceBucketDto = {
            _id: sourceBucketId,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Source Bucket`,
            storageType: StorageType.Image,
            publicUrl: `http://127.0.0.1:9000/${sourceBucket}`,
            mimeTypes: ["image/*"],
            credential_id: sourceCredId,
            updatedTimeUtc: Date.now(),
        };
        targetBucketDto = {
            _id: targetBucketId,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Target Bucket`,
            storageType: StorageType.Image,
            publicUrl: `http://127.0.0.1:9000/${targetBucket}`,
            mimeTypes: ["image/*"],
            credential_id: targetCredId,
            updatedTimeUtc: Date.now(),
        };

        await dbService.upsertDoc(sourceBucketDto);
        await dbService.upsertDoc(targetBucketDto);

        // Create S3Service instances
        sourceService = await S3Service.create(sourceBucketId, dbService);
        targetService = await S3Service.create(targetBucketId, dbService);

        // Create the buckets
        await sourceService.makeBucket();
        await targetService.makeBucket();
    });

    afterEach(async () => {
        // Clean up buckets after each test
        // Note: Some tests may leave files in buckets, which is fine for testing purposes
        try {
            if (sourceService) {
                await sourceService.removeBucket();
            }
        } catch (e) {
            // Bucket might have files or already be deleted
        }

        try {
            if (targetService) {
                await targetService.removeBucket();
            }
        } catch (e) {
            // Bucket might have files or already be deleted
        }

        S3Service.clearCache();
    });

    it("should migrate images from source bucket to target bucket", async () => {
        // Upload an image to the source bucket
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        const warnings = await processImage(image, undefined, dbService, sourceBucketId);

        expect(warnings).toBeDefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
        const uploadedFiles = image.fileCollections.flatMap((c) => c.imageFiles);
        expect(uploadedFiles.length).toBeGreaterThan(0);

        // Verify files exist in source bucket
        for (const file of uploadedFiles) {
            const exists = await sourceService
                .getObject(file.filename)
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(true);
        }

        // Now trigger migration by changing bucket ID
        const prevImage = JSON.parse(JSON.stringify(image)) as ImageDto;
        const migrationWarnings = await processImage(
            image,
            prevImage,
            dbService,
            targetBucketId,
            sourceBucketId,
        );

        // Check migration warnings
        expect(migrationWarnings.length).toBeGreaterThan(0);
        const successMessage = migrationWarnings.find((w) => w.includes("Successfully migrated"));
        expect(successMessage).toBeDefined();

        // Verify files now exist in target bucket
        for (const file of uploadedFiles) {
            const existsInTarget = await targetService
                .getObject(file.filename)
                .then(() => true)
                .catch(() => false);
            expect(existsInTarget).toBe(true);
        }

        // Verify files were deleted from source bucket
        for (const file of uploadedFiles) {
            const existsInSource = await sourceService
                .getObject(file.filename)
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
            dbService,
            targetBucketId,
            sourceBucketId,
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
            dbService,
            targetBucketId,
            sourceBucketId,
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

        const crossSystemBucketId = `storage-${uuidv4()}`;
        const crossSystemBucketName = `${uuidv4()}-cross-bucket`;
        const crossSystemCredId = await storeCryptoData(dbService, {
            ...crossSystemCredentials,
            bucketName: crossSystemBucketName,
        });

        const crossSystemBucketDto: StorageDto = {
            _id: crossSystemBucketId,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Cross System Bucket`,
            storageType: StorageType.Image,
            publicUrl: `https://s3.amazonaws.com/${crossSystemBucketName}`,
            mimeTypes: ["image/*"],
            credential_id: crossSystemCredId,
            updatedTimeUtc: Date.now(),
        };

        await dbService.upsertDoc(crossSystemBucketDto);

        // Upload an image to source
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        await processImage(image, undefined, dbService, sourceBucketId);

        const prevImage = JSON.parse(JSON.stringify(image)) as ImageDto;

        // Attempt migration to cross-system bucket (will fail due to invalid AWS credentials)
        // This may take longer due to network timeouts, so we increase the timeout
        const warnings = await processImage(
            image,
            prevImage,
            dbService,
            crossSystemBucketId,
            sourceBucketId,
        );

        // Should have migration failures (because AWS credentials are invalid)
        expect(warnings.length).toBeGreaterThan(0);
        // The migration might fail at different stages, so check for any failure-related message
        const hasFailureMessage =
            warnings.some((w) => w.includes("Failed to migrate")) ||
            warnings.some((w) => w.includes("Image migration failed")) ||
            warnings.some((w) => w.includes("remain in the old bucket"));
        expect(hasFailureMessage).toBe(true);
    }, 30000); // 30 second timeout for this test

    it("should preserve files in old bucket if migration fails", async () => {
        // Create an invalid target bucket that doesn't exist physically
        const invalidBucketId = `storage-${uuidv4()}`;
        const invalidBucketName = `nonexistent-bucket-${uuidv4()}`;
        const invalidCredId = await storeCryptoData(dbService, {
            endpoint: "http://127.0.0.1:9000",
            bucketName: invalidBucketName,
            accessKey: "minio",
            secretKey: "minio123",
        });

        const invalidBucketDto: StorageDto = {
            _id: invalidBucketId,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Invalid Bucket`,
            storageType: StorageType.Image,
            publicUrl: `http://127.0.0.1:9000/${invalidBucketName}`,
            mimeTypes: ["image/*"],
            credential_id: invalidCredId,
            updatedTimeUtc: Date.now(),
        };

        await dbService.upsertDoc(invalidBucketDto);

        // Upload an image to source
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        await processImage(image, undefined, dbService, sourceBucketId);

        const uploadedFiles = image.fileCollections.flatMap((c) => c.imageFiles);
        const prevImage = JSON.parse(JSON.stringify(image)) as ImageDto;

        // Attempt migration to invalid bucket
        const warnings = await processImage(
            image,
            prevImage,
            dbService,
            invalidBucketId,
            sourceBucketId,
        );

        // Check for failure warnings
        const failureMessage = warnings.find((w) => w.includes("Failed to migrate"));
        expect(failureMessage).toBeDefined();

        // Verify files still exist in source bucket
        for (const file of uploadedFiles) {
            const existsInSource = await sourceService
                .getObject(file.filename)
                .then(() => true)
                .catch(() => false);
            expect(existsInSource).toBe(true);
        }
    });
});

describe("S3ImageHandler - File Type Validation", () => {
    let dbService: DbService;
    let testBucket: string;
    let restrictedBucketId: string;
    let allowAllBucketId: string;
    let restrictedBucketDto: StorageDto;
    let allowAllBucketDto: StorageDto;
    let restrictedService: S3Service;

    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        bucketName: "", // will be set in beforeAll
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        const module = await createTestingModule("filetype-validation");
        dbService = module.dbService;

        testBucket = `filetype-test-${uuidv4()}`;
        restrictedBucketId = `storage-restricted-${uuidv4()}`;
        allowAllBucketId = `storage-allowall-${uuidv4()}`;

        // Create encrypted credentials for restricted bucket
        const restrictedCredId = await storeCryptoData(dbService, {
            ...testCredentials,
            bucketName: testBucket,
        });

        // Create encrypted credentials for allow-all bucket (same bucket, different config)
        const allowAllCredId = await storeCryptoData(dbService, {
            ...testCredentials,
            bucketName: testBucket,
        });

        // Create bucket with restricted file types
        restrictedBucketDto = {
            _id: restrictedBucketId,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Restricted Bucket`,
            storageType: StorageType.Image,
            publicUrl: `http://127.0.0.1:9000/${testBucket}/restricted`,
            mimeTypes: ["image/jpeg", "image/png"],
            credential_id: restrictedCredId,
            updatedTimeUtc: Date.now(),
        };

        // Create bucket with no file type restrictions (empty array)
        allowAllBucketDto = {
            _id: allowAllBucketId,
            type: DocType.Storage,
            memberOf: ["group-public-content"],
            name: `Allow All Bucket`,
            storageType: StorageType.Image,
            publicUrl: `http://127.0.0.1:9000/${testBucket}/allow-all`,
            mimeTypes: [],
            credential_id: allowAllCredId,
            updatedTimeUtc: Date.now(),
        };

        await dbService.upsertDoc(restrictedBucketDto);
        await dbService.upsertDoc(allowAllBucketDto);

        // Create S3Service instances
        restrictedService = await S3Service.create(restrictedBucketId, dbService);
        // Both buckets use the same physical bucket, so we only need one service instance
        // Create the test bucket (only need to create once since both use same bucket)
        await restrictedService.makeBucket();
    });

    afterAll(async () => {
        try {
            if (restrictedService) {
                await restrictedService.removeBucket();
            }
        } catch (e) {
            // Bucket might have files or already be deleted
        }
        S3Service.clearCache();
    });

    it("should allow upload when format matches allowed mimeTypes", async () => {
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        const warnings = await processImage(image, undefined, dbService, restrictedBucketId);

        // Should succeed without file type warnings
        const fileTypeWarning = warnings.find((w) => w.includes("not allowed"));
        expect(fileTypeWarning).toBeUndefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
    });

    it("should reject upload when format doesn't match allowed mimeTypes", async () => {
        // Update bucket to only allow webp (testImage.jpg will be rejected as it's jpeg)
        restrictedBucketDto.mimeTypes = ["image/webp"];
        await dbService.upsertDoc(restrictedBucketDto);

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        const warnings = await processImage(image, undefined, dbService, restrictedBucketId);

        // Should fail with file type warning (jpeg not allowed when only webp is allowed)
        const fileTypeWarning = warnings.find(
            (w) =>
                w.includes("not allowed") && (w.includes("image/jpeg") || w.includes("image/jpg")),
        );
        expect(fileTypeWarning).toBeDefined();
        expect(image.fileCollections.length).toBe(0);

        // Reset bucket for next tests
        restrictedBucketDto.mimeTypes = ["image/jpeg", "image/png"];
        await dbService.upsertDoc(restrictedBucketDto);
        // Clear cache to reload bucket config
        S3Service.clearCache(restrictedBucketId);
        restrictedService = await S3Service.create(restrictedBucketId, dbService);
    });

    it("should allow all uploads when mimeTypes is empty", async () => {
        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        const warnings = await processImage(image, undefined, dbService, allowAllBucketId);

        // Should succeed with any format when mimeTypes is empty
        const fileTypeWarning = warnings.find((w) => w.includes("not allowed"));
        expect(fileTypeWarning).toBeUndefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
    });

    it("should support wildcard mimeTypes like image/*", async () => {
        // Update bucket to use wildcard
        restrictedBucketDto.mimeTypes = ["image/*"];
        await dbService.upsertDoc(restrictedBucketDto);

        const image = new ImageDto();
        image.uploadData = [
            {
                fileData: fs.readFileSync(
                    path.resolve(__dirname + "/../../test/" + "testImage.jpg"),
                ) as unknown as ArrayBuffer,
                preset: "default",
            },
        ];

        const warnings = await processImage(image, undefined, dbService, restrictedBucketId);

        // Should succeed with wildcard match (jpeg matches image/*)
        const fileTypeWarning = warnings.find((w) => w.includes("not allowed"));
        expect(fileTypeWarning).toBeUndefined();
        expect(image.fileCollections.length).toBeGreaterThan(0);
    });
});
