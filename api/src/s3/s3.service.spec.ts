import { S3Service } from "./s3.service";
import { createTestingModule } from "../test/testingModule";
import { v4 as UUID } from "uuid";

describe("S3Service", () => {
    let service: S3Service;

    const testBucket = UUID();

    beforeAll(async () => {
        service = (await createTestingModule("s3-testing")).s3Service;
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

    it("can create an audio bucket", async () => {
        const audioBucket = UUID();
        service.audioBucket = audioBucket;
        await service.makeBucket(audioBucket);
        const result = await service.bucketExists(audioBucket);

        expect(result).toBeTruthy();
        await service.removeBucket(audioBucket);
    });

    it("can upload and get an audio object", async () => {
        const audioBucket = UUID();
        service.audioBucket = audioBucket;
        await service.makeBucket(audioBucket);

        const key = "testAudioFilename";
        const file = Buffer.from("testAudioFile");
        const mimetype = "audio/mpeg";

        const result = await service.uploadFile(audioBucket, key, file, mimetype);
        const returnedFile = await service.getObject(audioBucket, key);

        expect(result.etag).toBeDefined();
        expect(returnedFile).toBeDefined();

        await service.removeObjects(audioBucket, [key]);
        await service.removeBucket(audioBucket);
    });

    it("can generate audio URLs", () => {
        const testKey = "test-audio.mp3";
        const url = service.getAudioUrl(testKey);

        expect(url).toContain(testKey);
        expect(url).toMatch(/^https?:\/\//);
    });
});
