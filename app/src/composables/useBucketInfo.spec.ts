import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { ref } from "vue";
import {
    db,
    DocType,
    sharedHybridQueryCount,
    _resetSharedHybridQueryForTests,
} from "luminary-shared";
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
        // The bucket query is a shared, never-disposed instance — drop it so its live
        // subscription and settled output can't carry into the next test.
        _resetSharedHybridQueryForTests();
        await db.docs.clear();
        // The query is cached (`cache: true`), so it writes to localStorage; clear it
        // between tests to keep the synchronous seed from leaking across cases.
        localStorage.clear();
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

    it("seeds bucketBaseUrl synchronously from the cache on a warm remount", async () => {
        await db.docs.bulkPut([storageBucket1, storageBucket2]);

        // First mount warms the response cache (the write happens once the Dexie read lands).
        const first = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await waitForExpect(() => {
            expect(first.bucketBaseUrl.value).toBe("https://cdn.example.com");
        });

        // Drop the shared instance so the call below is genuinely a fresh mount rather
        // than a second subscriber to the already-settled one.
        _resetSharedHybridQueryForTests();

        // A fresh mount must resolve the URL on the synchronous first frame from the
        // seed — no awaiting. This is what stops <LImage> painting a fallback and then
        // swapping to the real image (the reload flash).
        const second = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        expect(second.bucketBaseUrl.value).toBe("https://cdn.example.com");
    });

    it("shares one query instance across call sites", async () => {
        await db.docs.bulkPut([storageBucket1]);

        // Every <LImage> on a page calls this; N instances would mean N Dexie
        // subscriptions and N cold-start POSTs of the same query.
        const first = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        const second = useBucketInfo(ref<string | undefined>("storage-bucket-2"));

        expect(sharedHybridQueryCount()).toBe(1);
        await waitForExpect(() => {
            expect(first.bucketBaseUrl.value).toBe("https://cdn.example.com");
        });
        expect(second.bucket.value).toBeNull();
    });
});
