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

let renderRoute = "/eng/an-article";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: renderRoute }) }));

const queryRemoteMock = vi.fn();

type Capture = {
    manifest: Record<string, Set<string>>;
    cache: Record<string, Record<string, string>>;
};

/** Stand in for the collector `vite.config.web.ts` installs for the prerender. */
function installCapture(): Capture {
    const state: Capture = { manifest: {}, cache: {} };
    (globalThis as Record<string, unknown>).__SSG_DEPS__ = state;
    return state;
}

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
        renderRoute = "/eng/an-article";
        localStorage.clear();
        (import.meta.env as { SSR: boolean }).SSR = true;
    });

    afterEach(() => {
        (import.meta.env as { SSR: boolean }).SSR = false;
        delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
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

    it("seeds the fetched buckets into the rendering page's response cache", async () => {
        const capture = installCapture();
        const useBucketInfo = await loadSubject();
        useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.all(prefetchCallbacks.map((cb) => cb()));

        const entries = capture.cache[renderRoute] ?? {};
        const keys = Object.keys(entries);
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatch(/^hqcache:/);
        expect(JSON.parse(entries[keys[0]])).toEqual({ local: [fakeBucket], remote: [] });
        // Captured from the same shared store the client reads, under the same key.
        expect(localStorage.getItem(keys[0])).toBe(entries[keys[0]]);
    });

    it("seeds once per rendered page, not once per call site", async () => {
        const capture = installCapture();
        const useBucketInfo = await loadSubject();
        useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.all(prefetchCallbacks.map((cb) => cb()));
        const firstRouteKey = Object.keys(capture.cache[renderRoute])[0];

        // A page's entries are dropped from the shared store once it finishes rendering,
        // so the next page must write its own copy rather than assume one is there.
        localStorage.removeItem(firstRouteKey);
        prefetchCallbacks.length = 0;
        renderRoute = "/eng/another-article";
        useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.all(prefetchCallbacks.map((cb) => cb()));

        expect(Object.keys(capture.cache["/eng/an-article"])).toHaveLength(1);
        expect(Object.keys(capture.cache["/eng/another-article"])).toHaveLength(1);
    });

    it("skips the seed when the build fetched no buckets", async () => {
        const capture = installCapture();
        queryRemoteMock.mockReset().mockResolvedValue([]);
        const useBucketInfo = await loadSubject();
        useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        await Promise.all(prefetchCallbacks.map((cb) => cb()));

        expect(capture.cache[renderRoute]).toBeUndefined();
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
