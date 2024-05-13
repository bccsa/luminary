import { S3Service } from "./s3.service";
import { createS3TestingModule } from "../test/testingModule";
import { v4 as UUID } from "uuid";

describe("S3Service", () => {
    let service: S3Service;

    const testBucket = UUID();

    beforeAll(async () => {
        service = (await createS3TestingModule()).s3Service;
    });

    beforeEach(async () => {});

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("can create a bucket", async () => {
        const bucket = testBucket; // TODO: Change to dynamically created bucket
        await service.makeBucket(bucket);
        const result = await service.bucketExists(bucket);

        expect(result).toBeTruthy();
    });

    it("can upload and get an object", async () => {
        const bucket = testBucket; // TODO: Change to dynamically created bucket
        const key = "testFilename";
        const file = Buffer.from("testFile");
        const mimetype = "testMimetype";

        const result = await service.uploadFile(bucket, key, file, mimetype);
        const returnedFile = await service.getObject(bucket, key);

        expect(result.etag).toBeDefined();
        expect(returnedFile).toBeDefined();
    });

    it("can remove objects", async () => {
        const bucket = testBucket; // TODO: Change to dynamically created bucket
        const keys = ["testFilename"];

        const result = await service.removeObjects(bucket, keys);
        let error;
        await service.getObject(bucket, keys[0]).catch((e) => (error = e));

        expect(result).toBeDefined();
        expect(error).toBeDefined();
    });
});
