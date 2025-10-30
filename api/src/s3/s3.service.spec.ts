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
        const result = await service.checkBucketConnectivity(testCredentials, testBucket);
        expect(result.status).toBe("connected");
    });
});
