import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { db, DocType, sharedHybridQueryCount } from "luminary-shared";
import { useBucketInfo } from "./useBucketInfo";
import waitForExpect from "wait-for-expect";

// Taken at import time, before any test has resolved a bucket — the shared registry is
// app-lifetime, so the counts below are only meaningful relative to this.
const REGISTRY_BASELINE = sharedHybridQueryCount();

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

        // A fresh mount must resolve the URL on the synchronous first frame from the
        // seed — no awaiting. This is what stops <LImage> painting a fallback and then
        // swapping to the real image (the reload flash).
        const second = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        expect(second.bucketBaseUrl.value).toBe("https://cdn.example.com");
    });
});

// Every rendered image resolves its CDN host through this composable, so a tile-heavy page
// calls it dozens of times. Ticket #2032: each call used to build its own HybridQuery — one
// Dexie subscription, one socket listener, and (until `storage` reaches the syncList on a
// cold start) one `POST /query` per caller.
describe("useBucketInfo — one shared query for every caller", () => {
    const TILES = 25;

    const ImageLike = defineComponent({
        props: { bucketId: { type: String, default: "storage-bucket-1" } },
        setup(props) {
            const { bucketBaseUrl } = useBucketInfo(ref(props.bucketId));
            return () => h("span", bucketBaseUrl.value ?? "");
        },
    });

    beforeEach(async () => {
        await db.docs.bulkPut([storageBucket1, storageBucket2]);
    });

    it("collapses many callers onto one instance", () => {
        const wrappers = Array.from({ length: TILES }, () => mount(ImageLike));

        expect(sharedHybridQueryCount()).toBe(REGISTRY_BASELINE + 1);
        wrappers.forEach((w) => w.unmount());
    });

    it("reuses the instance for callers mounting after the first page unmounts", () => {
        const first = mount(ImageLike);
        expect(sharedHybridQueryCount()).toBe(REGISTRY_BASELINE + 1);
        first.unmount();

        // The instance outlives its subscribers, so a later page's tiles attach to it
        // rather than re-reading the bucket list.
        const second = mount(ImageLike);
        expect(sharedHybridQueryCount()).toBe(REGISTRY_BASELINE + 1);
        second.unmount();
    });

    it("resolves each caller's own bucket out of the one shared list", async () => {
        const one = mount(ImageLike, { props: { bucketId: "storage-bucket-1" } });
        const two = mount(ImageLike, { props: { bucketId: "storage-bucket-2" } });

        // Differing bucket ids are a lookup into the shared result, not a reason to fan out.
        expect(sharedHybridQueryCount()).toBe(REGISTRY_BASELINE + 1);
        await waitForExpect(() => {
            expect(one.text()).toBe("https://cdn.example.com");
            expect(two.text()).toBe("https://cdn2.example.com");
        });

        one.unmount();
        two.unmount();
    });
});
