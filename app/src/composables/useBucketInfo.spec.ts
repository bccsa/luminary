import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { ref } from "vue";
import { db, DocType } from "luminary-shared";
import { useBucketInfo } from "./useBucketInfo";
import waitForExpect from "wait-for-expect";

const storageBucket1 = {
    _id: "storage-bucket-1",
    type: DocType.Storage,
    name: "Test Bucket",
    mimeTypes: ["image/jpeg"],
    publicUrl: "https://cdn.example.com",
    storageType: "S3",
    memberOf: [],
    updatedTimeUtc: Date.now(),
};

const storageBucket2 = {
    _id: "storage-bucket-2",
    type: DocType.Storage,
    name: "Another Bucket",
    mimeTypes: ["image/png"],
    publicUrl: "https://cdn2.example.com",
    storageType: "S3",
    memberOf: [],
    updatedTimeUtc: Date.now(),
};

describe("useBucketInfo", () => {
    afterEach(async () => {
        await db.docs.clear();
    });

    it("returns null bucket and undefined bucketBaseUrl when bucketId is undefined", async () => {
        const bucketId = ref<string | undefined>(undefined);
        const { bucket, bucketBaseUrl } = useBucketInfo(bucketId);

        await waitForExpect(() => {
            expect(bucket.value).toBeNull();
            expect(bucketBaseUrl.value).toBeUndefined();
        });
    });

    it("returns null bucket when no matching bucket found in DB", async () => {
        await db.docs.bulkPut([storageBucket1]);
        const bucketId = ref<string | undefined>("non-existent-bucket");
        const { bucket, bucketBaseUrl } = useBucketInfo(bucketId);

        await waitForExpect(() => {
            expect(bucket.value).toBeNull();
            expect(bucketBaseUrl.value).toBeUndefined();
        });
    });

    it("returns the correct bucket and publicUrl when a matching bucket exists", async () => {
        await db.docs.bulkPut([storageBucket1, storageBucket2]);
        const bucketId = ref<string | undefined>("storage-bucket-1");
        const { bucket, bucketBaseUrl } = useBucketInfo(bucketId);

        await waitForExpect(() => {
            expect(bucket.value).not.toBeNull();
            expect(bucket.value!._id).toBe("storage-bucket-1");
            expect(bucketBaseUrl.value).toBe("https://cdn.example.com");
        });
    });
});
