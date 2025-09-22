import { S3AudioService } from "./s3Audio.service";
import { createTestingModule } from "../test/testingModule";
import { v4 as UUID } from "uuid";

describe("S3AudioService", () => {
    let service: S3AudioService;

    const testBucket = UUID();

    beforeAll(async () => {
        service = (await createTestingModule("s3-audio")).s3AudioService;
    });

    beforeEach(async () => {});

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("can create a bucket", async () => {
        const bucket = testBucket;
        await service.makeBucket(bucket);
        const result = await service.bucketExists(bucket);

        expect(result).toBeTruthy();
    });

    it("can upload and get an object", async () => {
        const bucket = testBucket;
        const key = "testFilename";
        const file = Buffer.from("testFile");
        const mimetype = "testMimetype";

        const result = await service.uploadFile(bucket, key, file, mimetype);
        const returnedFile = await service.getObject(bucket, key);

        expect(result.etag).toBeDefined();
        expect(returnedFile).toBeDefined();
    });

    it("can remove objects", async () => {
        const bucket = testBucket;
        const keys = ["testFilename"];

        const result = await service.removeObjects(bucket, keys);
        let error;
        await service.getObject(bucket, keys[0]).catch((e) => (error = e));

        expect(result).toBeDefined();
        expect(error).toBeDefined();
    });
});
