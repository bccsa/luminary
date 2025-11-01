import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import { v4 as UUID } from "uuid";
import * as Minio from "minio";

describe("S3Service", () => {
    let service: S3Service;
    let testClient: Minio.Client;

    const testBucket = UUID();
    const testCredentials = {
        endpoint: "http://127.0.0.1:9000",
        accessKey: "minio",
        secretKey: "minio123",
    };

    beforeAll(async () => {
        service = (await createTestingModule("s3-testing")).s3Service;
        testClient = service.createClient(testCredentials);
    });

    beforeEach(async () => {});

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("can create a client", () => {
        const client = service.createClient(testCredentials);
        expect(client).toBeDefined();
        expect(client).toBeInstanceOf(Minio.Client);
    });

    it("can create a bucket", async () => {
        const bucket = testBucket;
        await service.makeBucket(testClient, bucket);
        const result = await service.bucketExists(testClient, bucket);

        expect(result).toBeTruthy();
    });

    it("can upload and get an object", async () => {
        const bucket = testBucket;
        const key = "testFilename";
        const file = Buffer.from("testFile");
        const mimetype = "testMimetype";

        const result = await service.uploadFile(testClient, bucket, key, file, mimetype);
        const returnedFile = await service.getObject(testClient, bucket, key);

        expect(result.etag).toBeDefined();
        expect(returnedFile).toBeDefined();
    });

    it("can remove objects", async () => {
        const bucket = testBucket;
        const keys = ["testFilename"];

        const result = await service.removeObjects(testClient, bucket, keys);
        let error;
        await service.getObject(testClient, bucket, keys[0]).catch((e) => (error = e));

        expect(result).toBeDefined();
        expect(error).toBeDefined();
    });

    it("can check connection", async () => {
        const isConnected = await service.checkConnection(testClient);
        expect(isConnected).toBe(true);
    });

    it("can check bucket connectivity", async () => {
        const result = await service.checkBucketConnectivity(testCredentials);
        expect(result.status).toBe("connected");
    });

    it("can extract bucket name from path-style URL", () => {
        expect(service.extractBucketNameFromUrl("https://s3.cdn.bcc.africa/ac-images")).toBe(
            "ac-images",
        );
        expect(service.extractBucketNameFromUrl("http://localhost:9000/images")).toBe("images");
        expect(
            service.extractBucketNameFromUrl("https://minio.example.com:9000/my-bucket-name"),
        ).toBe("my-bucket-name");
    });

    it("can extract bucket name from virtual-hosted style URL", () => {
        expect(service.extractBucketNameFromUrl("https://mybucket.s3.amazonaws.com")).toBe(
            "mybucket",
        );
        expect(
            service.extractBucketNameFromUrl("https://test-bucket.s3.us-west-2.amazonaws.com"),
        ).toBe("test-bucket");
    });

    it("throws error for invalid URLs", () => {
        expect(() => service.extractBucketNameFromUrl("invalid-url")).toThrow(
            "Invalid public URL format",
        );
        expect(() => service.extractBucketNameFromUrl("https://example.com")).toThrow(
            "Could not extract bucket name from URL",
        );
        expect(() => service.extractBucketNameFromUrl("")).toThrow("Invalid public URL format");
    });

    it("can list objects in a bucket", async () => {
        const bucket = testBucket;
        const key1 = "file1.txt";
        const key2 = "file2.txt";
        const file = Buffer.from("test content");

        // Upload two files
        await service.uploadFile(testClient, bucket, key1, file, "text/plain");
        await service.uploadFile(testClient, bucket, key2, file, "text/plain");

        // List objects
        const stream = await service.listObjects(testClient, bucket);
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
        const bucket = testBucket;
        const existingKey = "existing-file.txt";
        const nonExistingKey = "non-existing-file.txt";
        const file = Buffer.from("test content");

        await service.uploadFile(testClient, bucket, existingKey, file, "text/plain");

        const exists = await service.objectExists(testClient, bucket, existingKey);
        const notExists = await service.objectExists(testClient, bucket, nonExistingKey);

        expect(exists).toBe(true);
        expect(notExists).toBe(false);
    });

    it("can validate successful image upload", async () => {
        const bucket = testBucket;
        const key = "valid-image.jpg";
        const file = Buffer.from("fake image data");

        await service.uploadFile(testClient, bucket, key, file, "image/jpeg");

        const result = await service.validateImageUpload(testClient, bucket, key);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("returns error when validating upload in non-existent bucket", async () => {
        const nonExistentBucket = "non-existent-bucket-" + UUID();
        const key = "image.jpg";

        const result = await service.validateImageUpload(testClient, nonExistentBucket, key);

        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist");
    });

    it("returns error when validating non-existent object", async () => {
        const bucket = testBucket;
        const nonExistentKey = "non-existent-image.jpg";

        const result = await service.validateImageUpload(testClient, bucket, nonExistentKey);

        expect(result.success).toBe(false);
        expect(result.error).toContain("validation failed");
    });

    it("can check image accessibility for multiple images", async () => {
        const bucket = testBucket;
        const accessibleKey1 = "accessible1.jpg";
        const accessibleKey2 = "accessible2.jpg";
        const inaccessibleKey = "inaccessible.jpg";
        const file = Buffer.from("image data");

        // Upload only two of the three images
        await service.uploadFile(testClient, bucket, accessibleKey1, file, "image/jpeg");
        await service.uploadFile(testClient, bucket, accessibleKey2, file, "image/jpeg");

        const inaccessible = await service.checkImageAccessibility(testClient, bucket, [
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
        const bucket = "temp-bucket-" + UUID();

        await service.makeBucket(testClient, bucket);
        const existsBefore = await service.bucketExists(testClient, bucket);

        await service.removeBucket(testClient, bucket);
        const existsAfter = await service.bucketExists(testClient, bucket);

        expect(existsBefore).toBe(true);
        expect(existsAfter).toBe(false);
    });

    it("can create client with custom port and SSL settings", () => {
        const httpsClient = service.createClient({
            endpoint: "https://s3.example.com:9000",
            accessKey: "test",
            secretKey: "test",
            port: 9000,
            useSSL: true,
        });

        const httpClient = service.createClient({
            endpoint: "http://localhost:9000",
            accessKey: "test",
            secretKey: "test",
            port: 9000,
            useSSL: false,
        });

        expect(httpsClient).toBeInstanceOf(Minio.Client);
        expect(httpClient).toBeInstanceOf(Minio.Client);
    });

    it("returns false when checking connection with invalid credentials", async () => {
        const invalidClient = service.createClient({
            endpoint: "http://127.0.0.1:9000",
            accessKey: "invalid",
            secretKey: "invalid",
        });

        const isConnected = await service.checkConnection(invalidClient);
        expect(isConnected).toBe(false);
    });

    it("returns unauthorized status for invalid credentials", async () => {
        const result = await service.checkBucketConnectivity({
            endpoint: "http://127.0.0.1:9000",
            accessKey: "invalid",
            secretKey: "invalid",
        });

        // MinIO may return unauthorized or unreachable depending on the error
        expect(["unauthorized", "unreachable"]).toContain(result.status);
        expect(result.message).toBeDefined();
    });

    it("returns unreachable status for invalid endpoint", async () => {
        const result = await service.checkBucketConnectivity({
            endpoint: "http://non-existent-host-12345.example.com:9000",
            accessKey: "test",
            secretKey: "test",
        });

        expect(result.status).toBe("unreachable");
        expect(result.message).toBeDefined();
    });
});
