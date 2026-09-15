import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { db, DocType, type StorageDto, _resetSharedHybridQueryForTests } from "luminary-shared";
import { useBucketInfo } from "./useBucketInfo";

// Both halves of the handoff run against ONE module instance (no `vi.resetModules`) so the
// client half reads the same initialized data layer a real browser has, and the cache key it
// computes is the one the prerender actually wrote — the agreement this file exists to prove.

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

// A build renders each route once, and the seed is written once per route — so give every
// test its own page rather than resetting the module between them.
let renderRoute = "";
let pageCounter = 0;
vi.mock("vue-router", () => ({ useRoute: () => ({ path: renderRoute }) }));

const queryRemoteMock = vi.fn();
// Proxy rather than a spread: `db` is a live binding assigned by the setup's `initDatabase`,
// and a spread would freeze it at its pre-init `undefined`.
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return new Proxy(actual, {
        get: (target, prop) =>
            prop === "queryRemote" ? queryRemoteMock : Reflect.get(target, prop),
    });
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

type Capture = { manifest: Record<string, unknown>; cache: Record<string, Record<string, string>> };

/**
 * Run the build half: install the collector `vite.config.web.ts` provides, render the page,
 * and return the entries it captured for inlining into the HTML.
 */
async function prerenderPage(): Promise<Record<string, string>> {
    (import.meta.env as { SSR: boolean }).SSR = true;
    const capture: Capture = { manifest: {}, cache: {} };
    (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;

    useBucketInfo(ref<string | undefined>("storage-bucket-1"));
    await Promise.all(prefetchCallbacks.map((cb) => cb()));

    (import.meta.env as { SSR: boolean }).SSR = false;
    delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
    return capture.cache[renderRoute] ?? {};
}

/** Let the query's local leg run to completion — a real Dexie round trip plus its publish. */
async function settleLocalRead(): Promise<void> {
    await db.docs.count();
    await new Promise((resolve) => setTimeout(resolve, 20));
}

/** Replay the page's inline seed script into a browser that has nothing else stored. */
function loadPageInFreshBrowser(inlined: Record<string, string>): void {
    localStorage.clear();
    for (const [key, value] of Object.entries(inlined)) localStorage.setItem(key, value);
}

describe("useBucketInfo — SSG prerender → client handoff", () => {
    beforeEach(() => {
        prefetchCallbacks.length = 0;
        queryRemoteMock.mockReset().mockResolvedValue([fakeBucket]);
        renderRoute = `/eng/page-${++pageCounter}`;
    });

    afterEach(async () => {
        _resetSharedHybridQueryForTests();
        (import.meta.env as { SSR: boolean }).SSR = false;
        delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
        await db.docs.clear();
        localStorage.clear();
    });

    it("resolves the bucket URL on the client's first frame from the prerendered seed", async () => {
        const inlined = await prerenderPage();
        expect(Object.keys(inlined)).toHaveLength(1);
        loadPageInFreshBrowser(inlined);

        // IndexedDB is empty: a first-time visitor whose sync hasn't delivered the storage
        // docs yet. The URL must still be there synchronously — an undefined one renders an
        // empty srcset, which is what makes <LImage> paint a fallback and then swap.
        const { bucketBaseUrl } = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        expect(bucketBaseUrl.value).toBe("https://cdn.example.com");
    });

    it("keeps the URL when the live read takes over from the seed", async () => {
        loadPageInFreshBrowser(await prerenderPage());
        // Sync has delivered the storage docs, so the authoritative read replaces the seed.
        await db.docs.bulkPut([fakeBucket]);

        const { bucketBaseUrl } = useBucketInfo(ref<string | undefined>("storage-bucket-1"));
        expect(bucketBaseUrl.value).toBe("https://cdn.example.com");

        await settleLocalRead();
        expect(bucketBaseUrl.value).toBe("https://cdn.example.com");
    });
});
