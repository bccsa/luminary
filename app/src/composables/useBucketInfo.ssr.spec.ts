import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { DocType, type StorageDto } from "luminary-shared";

// Collect onServerPrefetch callbacks instead of invoking them immediately (unlike
// useContentQuery.ssr.spec.ts's mock) so a rejecting fetch in the retry test below can be
// awaited explicitly via Promise.allSettled, rather than becoming an unhandled rejection.
const prefetchCallbacks: Array<() => Promise<unknown>> = [];
vi.mock("vue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("vue")>();
    return {
        ...actual,
        onServerPrefetch: (cb: () => unknown) => {
            prefetchCallbacks.push(cb as () => Promise<unknown>);
        },
    };
});

const queryRemoteMock = vi.fn();

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return { ...actual, queryRemote: (...args: unknown[]) => queryRemoteMock(...args) };
});

const fakeBucket = {
    _id: "storage-bucket-1",
    type: DocType.Storage,
    name: "Test Bucket",
    mimeTypes: ["image/jpeg"],
    publicUrl: "https://cdn.example.com",
    storageType: "S3",
    memberOf: [],
    updatedTimeUtc: 1000,
} as unknown as StorageDto;

// `bucketsPromise` is module-level state inside useBucketInfo.ts — reset the module
// registry and re-import fresh per test so one test's cached promise can't leak into another.
async function loadSubject() {
    vi.resetModules();
    return (await import("./useBucketInfo")).useBucketInfo;
}

describe("useBucketInfo — SSR prerender path", () => {
    beforeEach(() => {
        prefetchCallbacks.length = 0;
        queryRemoteMock.mockReset().mockResolvedValue([fakeBucket]);
        (import.meta.env as { SSR: boolean }).SSR = true;
    });

    afterEach(() => {
        (import.meta.env as { SSR: boolean }).SSR = false;
    });

    it("fetches the storage buckets exactly once across multiple calls in the same build", async () => {
        const useBucketInfo = await loadSubject();
        const first = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        const second = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.all(prefetchCallbacks.map((cb) => cb()));

        expect(queryRemoteMock).toHaveBeenCalledTimes(1);
        expect(first.bucketBaseUrl.value).toBe("https://cdn.example.com");
        expect(second.bucketBaseUrl.value).toBe("https://cdn.example.com");
    });

    it("retries on the next call after a rejected fetch instead of caching the failure", async () => {
        const useBucketInfo = await loadSubject();
        queryRemoteMock.mockReset().mockRejectedValueOnce(new Error("network blip"));

        const failing = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.allSettled(prefetchCallbacks.map((cb) => cb()));
        expect(failing.bucketBaseUrl.value).toBeUndefined();

        prefetchCallbacks.length = 0;
        queryRemoteMock.mockResolvedValueOnce([fakeBucket]);
        const retried = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.all(prefetchCallbacks.map((cb) => cb()));

        expect(queryRemoteMock).toHaveBeenCalledTimes(2);
        expect(retried.bucketBaseUrl.value).toBe("https://cdn.example.com");
    });
});
