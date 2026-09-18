import { Readable } from "stream";
import { processImage } from "./processImageDto";
import { S3Service } from "../../s3/s3.service";
import { DbService } from "../../db/db.service";
import { ImageDto } from "../../dto/ImageDto";

jest.mock("../../s3/s3.service", () => ({ S3Service: { create: jest.fn() } }));

const FILES = ["a.webp", "b.webp", "c.webp"];

/** A bucket stub with the surface `migrateImagesBetweenBuckets` uses. */
const bucketStub = (name: string) => ({
    getBucketName: () => name,
    getObject: jest.fn(async (key: string) => Readable.from([Buffer.from(`bytes-of-${key}`)])),
    uploadFile: jest.fn<Promise<void>, [string, Buffer, string]>(async () => undefined),
    getClient: () => ({
        statObject: jest.fn(async () => ({ metaData: { "content-type": "image/webp" } })),
        removeObject: jest.fn<Promise<void>, [string, string]>(async () => undefined),
    }),
});

/**
 * The client is rebuilt on every `getClient()` call above, so the calls a test wants to
 * count have to land on one object.
 */
const stableBucket = (name: string) => {
    const client = {
        statObject: jest.fn(async () => ({ metaData: { "content-type": "image/webp" } })),
        removeObject: jest.fn<Promise<void>, [string, string]>(async () => undefined),
    };
    return { ...bucketStub(name), getClient: () => client, client };
};

const image = (filenames = FILES): ImageDto =>
    ({
        fileCollections: [
            { aspectRatio: 1, imageFiles: filenames.map((filename) => ({ filename })) },
        ],
    }) as unknown as ImageDto;

const db = {} as DbService;

let oldBucket: ReturnType<typeof stableBucket>;
let newBucket: ReturnType<typeof stableBucket>;

beforeEach(() => {
    jest.clearAllMocks();
    oldBucket = stableBucket("old-bucket");
    newBucket = stableBucket("new-bucket");

    (S3Service.create as jest.Mock).mockImplementation(async (bucketId: string) =>
        bucketId === "bucket-old" ? oldBucket : newBucket,
    );
});

const migrate = (doc: ImageDto, prev: ImageDto | undefined = image()) =>
    processImage(doc, prev, db, "bucket-new", "bucket-old");

describe("image bucket migration", () => {
    it("copies every file to the new bucket and removes nothing before the write", async () => {
        const result = await migrate(image());

        expect(newBucket.uploadFile).toHaveBeenCalledTimes(FILES.length);
        expect(newBucket.uploadFile.mock.calls.map((c) => c[0])).toEqual(FILES);
        expect(oldBucket.client.removeObject).not.toHaveBeenCalled();

        expect(result.migrationFailed).toBe(false);
        expect(result.removeSource).toBeDefined();
        expect(result.warnings).toContain(
            "Successfully migrated 3 image file(s) from bucket old-bucket to new-bucket",
        );
    });

    it("removes the source files only when the returned cleanup is run", async () => {
        const result = await migrate(image());

        expect(oldBucket.client.removeObject).not.toHaveBeenCalled();

        const cleanupWarnings = await result.removeSource();

        expect(cleanupWarnings).toEqual([]);
        expect(oldBucket.client.removeObject.mock.calls.map((c) => c[1])).toEqual(FILES);
    });

    it("preserves the whole collection in the old bucket when a copy fails", async () => {
        newBucket.uploadFile
            .mockImplementationOnce(async () => undefined)
            .mockImplementationOnce(async () => {
                throw new Error("connection reset");
            });

        const result = await migrate(image());

        expect(result.migrationFailed).toBe(true);
        expect(result.removeSource).toBeUndefined();
        // The one file that did copy must stay in the old bucket too: the caller reverts
        // the document to it.
        expect(oldBucket.client.removeObject).not.toHaveBeenCalled();
        expect(result.warnings).toContain(
            "Failed to migrate b.webp from bucket old-bucket to new-bucket: connection reset",
        );
        expect(result.warnings).toContain(
            "Image migration stopped after 1 of 3 file(s). All files remain in bucket old-bucket.",
        );
    });

    it("stops at the first failure rather than copying the rest", async () => {
        newBucket.uploadFile.mockImplementationOnce(async () => {
            throw new Error("connection reset");
        });

        await migrate(image());

        expect(newBucket.uploadFile).toHaveBeenCalledTimes(1);
    });

    it("reports a source file it could not remove after the write", async () => {
        const result = await migrate(image());
        oldBucket.client.removeObject.mockImplementationOnce(async () => {
            throw new Error("access denied");
        });

        const cleanupWarnings = await result.removeSource();

        expect(cleanupWarnings).toEqual([
            "a.webp was copied to bucket new-bucket but could not be removed from bucket " +
                "old-bucket: access denied. Please remove it on the storage provider.",
        ]);
        // The rest are still removed: one refusal is not a reason to leave the others.
        expect(oldBucket.client.removeObject).toHaveBeenCalledTimes(FILES.length);
    });

    it("does not migrate an empty collection", async () => {
        const result = await migrate(image([]), image([]));

        expect(newBucket.uploadFile).not.toHaveBeenCalled();
        expect(result.migrationFailed).toBe(false);
        expect(result.removeSource).toBeUndefined();
    });

    it("does not migrate when the bucket is unchanged", async () => {
        const result = await processImage(image(), image(), db, "bucket-old", "bucket-old");

        expect(S3Service.create).not.toHaveBeenCalled();
        expect(result.removeSource).toBeUndefined();
    });
});
