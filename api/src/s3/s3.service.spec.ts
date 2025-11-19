import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import { v4 as UUID } from "uuid";
import { storeCryptoData } from "../util/encryption";

describe("S3Service", () => {
    let service: S3Service;
    let dbService: any;
    let testBucketId: string;

    const testBucket = UUID();

    beforeAll(async () => {
        const module = await createTestingModule("s3-testing");
        dbService = module.dbService;

        // Create encrypted credentials for the test bucket
        const credentialData = {
            endpoint: `http://${process.env.S3_ENDPOINT}:${process.env.S3_PORT}`,
            bucketName: testBucket,
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
        };

        const encryptedCredId = await storeCryptoData(dbService, credentialData);

        // Create a bucket document
        testBucketId = "test-bucket-" + UUID();
        const bucketDoc = {
            _id: testBucketId,
            type: "storage",
            name: "Test Bucket",
            mimeTypes: ["image/*"],
            publicUrl: "http://localhost:9000/test-bucket",
            bucketType: "s3",
            credential_id: encryptedCredId,
        };

        await dbService.upsertDoc(bucketDoc);

        // Create S3Service instance using the new API
        service = await S3Service.create(testBucketId, dbService);

        // Create the test bucket
        try {
            await service.makeBucket();
        } catch (error) {
            // Bucket might already exist, ignore the error
            console.log("Test bucket already exists or creation failed:", error.message);
        }
    });

    afterAll(() => {
        // Clear the singleton cache after tests
        S3Service.clearCache();
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("uses singleton pattern - returns same instance for same bucket ID", async () => {
        const instance1 = await S3Service.create(testBucketId, dbService);
        const instance2 = await S3Service.create(testBucketId, dbService);
        expect(instance1).toBe(instance2);
    });

    it("can create a bucket", async () => {
        try {
            await service.makeBucket();
        } catch (error) {
            // Bucket might already exist, which is fine for this test
            if (!error.message?.includes("already own it")) {
                throw error;
            }
        }
        const result = await service.bucketExists();

        expect(result).toBeTruthy();
    });

    it("can upload and get an object", async () => {
        const key = "testFilename";
        const file = Buffer.from("testFile");
        const mimetype = "testMimetype";

        const result = await service.uploadFile(key, file, mimetype);
        const returnedFile = await service.getObject(key);

        expect(result.etag).toBeDefined();
        expect(returnedFile).toBeDefined();
    });

    it("can remove objects", async () => {
        const keys = ["testFilename"];

        const result = await service.removeObjects(keys);
        let error;
        await service.getObject(keys[0]).catch((e) => (error = e));

        expect(result).toBeDefined();
        expect(error).toBeDefined();
    });

    it("can check connection", async () => {
        const isConnected = await service.checkConnection();
        expect(isConnected).toBe(true);
    });

    it("can check bucket connectivity", async () => {
        const result = await service.checkBucketConnectivity();
        expect(result.status).toBe("connected");
    });

    it("can list objects in a bucket", async () => {
        const key1 = "file1.txt";
        const key2 = "file2.txt";
        const file = Buffer.from("test content");

        // Upload two files
        await service.uploadFile(key1, file, "text/plain");
        await service.uploadFile(key2, file, "text/plain");

        // List objects
        const stream = await service.listObjects();
        const objects: string[] = [];

        await new Promise<void>((resolve, reject) => {
            stream.on("data", (obj) => objects.push(obj.name));
            stream.on("end", () => resolve());
            stream.on("error", (err) => reject(err));
        });

        expect(objects).toContain(key1);
        expect(objects).toContain(key2);
    });

    it("can check if an object exists", async () => {
        const existingKey = "existing-file.txt";
        const nonExistingKey = "non-existing-file.txt";
        const file = Buffer.from("test content");

        await service.uploadFile(existingKey, file, "text/plain");

        const exists = await service.objectExists(existingKey);
        const notExists = await service.objectExists(nonExistingKey);

        expect(exists).toBe(true);
        expect(notExists).toBe(false);
    });

    it("can validate successful image upload", async () => {
        const key = "valid-image.jpg";
        const file = Buffer.from("fake image data");

        await service.uploadFile(key, file, "image/jpeg");

        const result = await service.validateImageUpload(key);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("returns error when validating upload in non-existent bucket", async () => {
        const nonExistentBucket = "non-existent-bucket-" + UUID();
        const key = "image.jpg";

        // Create a bucket document for a non-existent bucket
        const nonExistentBucketId = "non-existent-" + UUID();
        const credentialData = {
            endpoint: `http://${process.env.S3_ENDPOINT}:${process.env.S3_PORT}`,
            bucketName: nonExistentBucket,
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
        };
        const encryptedCredId = await storeCryptoData(dbService, credentialData);
        await dbService.upsertDoc({
            _id: nonExistentBucketId,
            type: "storage",
            name: "Non-existent Bucket",
            mimeTypes: ["image/*"],
            publicUrl: "http://localhost:9000/non-existent",
            bucketType: "s3",
            credential_id: encryptedCredId,
        });

        const nonExistentService = await S3Service.create(nonExistentBucketId, dbService);
        const result = await nonExistentService.validateImageUpload(key);

        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist");
    });

    it("returns error when validating non-existent object", async () => {
        const nonExistentKey = "non-existent-image.jpg";

        const result = await service.validateImageUpload(nonExistentKey);

        expect(result.success).toBe(false);
        expect(result.error).toContain("validation failed");
    });

    it("can check image accessibility for multiple images", async () => {
        const accessibleKey1 = "accessible1.jpg";
        const accessibleKey2 = "accessible2.jpg";
        const inaccessibleKey = "inaccessible.jpg";
        const file = Buffer.from("image data");

        // Upload only two of the three images
        await service.uploadFile(accessibleKey1, file, "image/jpeg");
        await service.uploadFile(accessibleKey2, file, "image/jpeg");

        const inaccessible = await service.checkImageAccessibility([
            accessibleKey1,
            accessibleKey2,
            inaccessibleKey,
        ]);

        expect(inaccessible).toHaveLength(1);
        expect(inaccessible).toContain(inaccessibleKey);
        expect(inaccessible).not.toContain(accessibleKey1);
        expect(inaccessible).not.toContain(accessibleKey2);
    });

    it("can remove a bucket", async () => {
        // Create a new service instance for a temporary bucket
        const tempBucketName = "temp-bucket-" + UUID();
        const credentialData = {
            endpoint: `http://${process.env.S3_ENDPOINT}:${process.env.S3_PORT}`,
            bucketName: tempBucketName,
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
        };
        const encryptedCredId = await storeCryptoData(dbService, credentialData);
        const tempBucketId = "temp-bucket-doc-" + UUID();
        await dbService.upsertDoc({
            _id: tempBucketId,
            type: "storage",
            name: "Temp Bucket",
            mimeTypes: ["image/*"],
            publicUrl: "http://localhost:9000/temp-bucket",
            bucketType: "s3",
            credential_id: encryptedCredId,
        });

        const tempService = await S3Service.create(tempBucketId, dbService);

        await tempService.makeBucket();
        const existsBefore = await tempService.bucketExists();

        await tempService.removeBucket();
        const existsAfter = await tempService.bucketExists();

        expect(existsBefore).toBe(true);
        expect(existsAfter).toBe(false);
    });

    it("returns false when checking connection with invalid client", async () => {
        // Create a new bucket with invalid credentials
        const invalidCredData = {
            endpoint: `http://${process.env.S3_ENDPOINT}:${process.env.S3_PORT}`,
            bucketName: testBucket,
            accessKey: "invalid",
            secretKey: "invalid",
        };

        const invalidCredId = await storeCryptoData(dbService, invalidCredData);
        const invalidBucketId = "invalid-bucket-" + UUID();
        const invalidBucketDoc = {
            _id: invalidBucketId,
            type: "storage",
            name: "Invalid Bucket",
            mimeTypes: ["image/*"],
            publicUrl: "http://localhost:9000/invalid-bucket",
            bucketType: "s3",
            credential_id: invalidCredId,
        };

        await dbService.upsertDoc(invalidBucketDoc);

        const invalidService = await S3Service.create(invalidBucketId, dbService);

        const isConnected = await invalidService.checkConnection();
        expect(isConnected).toBe(false);
    });

    it("returns unauthorized status for invalid credentials", async () => {
        const invalidCredData = {
            endpoint: `http://${process.env.S3_ENDPOINT}:${process.env.S3_PORT}`,
            bucketName: testBucket,
            accessKey: "invalid",
            secretKey: "invalid",
        };

        const invalidCredId = await storeCryptoData(dbService, invalidCredData);
        const invalidBucketId = "invalid-cred-bucket-" + UUID();
        const invalidBucketDoc = {
            _id: invalidBucketId,
            type: "storage",
            name: "Invalid Cred Bucket",
            mimeTypes: ["image/*"],
            publicUrl: "http://localhost:9000/invalid-bucket",
            bucketType: "s3",
            credential_id: invalidCredId,
        };

        await dbService.upsertDoc(invalidBucketDoc);

        const invalidService = await S3Service.create(invalidBucketId, dbService);
        const result = await invalidService.checkBucketConnectivity();

        // MinIO may return unauthorized or unreachable depending on the error
        expect(["unauthorized", "unreachable"]).toContain(result.status);
        expect(result.message).toBeDefined();
    });

    it("returns unreachable status for invalid endpoint", async () => {
        const unreachableCredData = {
            endpoint: "http://non-existent-host-12345.example.com:9000",
            bucketName: "test-bucket",
            accessKey: "test",
            secretKey: "test",
        };

        const unreachableCredId = await storeCryptoData(dbService, unreachableCredData);
        const unreachableBucketId = "unreachable-bucket-" + UUID();
        const unreachableBucketDoc = {
            _id: unreachableBucketId,
            type: "storage",
            name: "Unreachable Bucket",
            mimeTypes: ["image/*"],
            publicUrl: "http://non-existent-host-12345.example.com:9000/test-bucket",
            bucketType: "s3",
            credential_id: unreachableCredId,
        };

        await dbService.upsertDoc(unreachableBucketDoc);

        const unreachableService = await S3Service.create(unreachableBucketId, dbService);
        const result = await unreachableService.checkBucketConnectivity();

        expect(result.status).toBe("unreachable");
        expect(result.message).toBeDefined();
    });
});
