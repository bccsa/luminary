import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { effectScope } from "vue";
import { DocType, db, type ContentDto } from "luminary-shared";

// Mock `onServerPrefetch` to invoke its callback immediately, reproducing what a real SSR
// render does (the callback is awaited before the page is serialized) without a full
// component harness.
vi.mock("vue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("vue")>();
    return { ...actual, onServerPrefetch: (cb: () => unknown) => cb() };
});

// The real prerender reads the route off the router vite-ssg has already pushed to the page
// being rendered; this harness calls the composable directly, so stand in a settable route.
const routeMock = vi.hoisted(() => ({ path: "/test-route" }));
vi.mock("vue-router", () => ({ useRoute: () => routeMock }));

// Mock ONLY queryRemote so the prerender leg returns deterministic docs. The real
// writeResponseCache / readResponseCache / structuralCacheKey / db MUST stay live — the
// whole point is to exercise the genuine storage path end to end through the shared
// HybridQuery, not a mocked writer.
const queryRemoteMock = vi.fn();
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return {
        ...actual,
        queryRemote: (...args: unknown[]) => queryRemoteMock(...args),
        // The spread above copies `db` by value at factory time, which runs before the
        // test setup's initDatabase() has assigned the real database singleton — so the
        // spread captures `undefined` and the live module binding is lost. Expose `db`
        // through an accessor that reads `actual.db` at ACCESS time instead, preserving
        // the live binding. Placed after the spread so it wins.
        get db() {
            return actual.db;
        },
    };
});

const hasPersistedSessionMock = vi.fn(() => false);
vi.mock("@/auth", () => ({ hasPersistedSession: () => hasPersistedSessionMock() }));

import { useContentQuery } from "@/composables/useContentQuery";

const fakeDoc = {
    _id: "content-1",
    type: DocType.Content,
    updatedTimeUtc: 1000,
    parentId: "parent-1",
    title: "Title",
    text: "<p>Full body</p>",
    fts: ["abc:1"],
    ftsTokenCount: 5,
    memberOf: ["group-1"],
    _rev: "1-abc",
} as unknown as ContentDto;

type CaptureState = {
    manifest: Record<string, Set<string>>;
    cache: Record<string, Record<string, string>>;
};

function installCapture(): CaptureState {
    const capture: CaptureState = { manifest: {}, cache: {} };
    (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;
    return capture;
}

function clearCapture(): void {
    delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
}

// Enumerate localStorage keys via the Storage interface (length + key(i)) rather than
// Object.keys, which in some test environments returns the Storage prototype members
// (clear, getItem, setItem, …) instead of the actual stored entries.
function localStorageKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null) keys.push(k);
    }
    return keys;
}

// The shared options object used by every leg of every test — identical arguments are what
// makes the prerender's cache key and the client's cache key resolve to the same entry.
const sharedOptions = {
    cache: true,
    cacheId: "hydration-contract",
    publishedFilter: false,
    languageFilter: false,
} as const;

/**
 * SSG hydration contract — the only test that exercises the prerender's response-cache
 * write, the inline-script replay into localStorage, and the client's synchronous seed
 * read together through the REAL shared HybridQuery. A change to the shared response-cache
 * key, prefix, storage medium, or seed-read ordering fails here rather than silently
 * reintroducing a hydration flash in a production build.
 */
describe("SSG hydration contract", () => {
    beforeEach(async () => {
        queryRemoteMock.mockReset().mockResolvedValue([{ ...fakeDoc }]);
        hasPersistedSessionMock.mockReset().mockReturnValue(false);
        localStorage.clear();
        await db.docs.clear();
        (import.meta.env as { SSR: boolean }).SSR = true;
    });

    afterEach(async () => {
        (import.meta.env as { SSR: boolean }).SSR = false;
        routeMock.path = "/test-route";
        clearCapture();
        localStorage.clear();
        await db.docs.clear();
    });

    it("a prerendered seed paints the client's first render synchronously", async () => {
        // --- Prerender leg (Node) ---
        routeMock.path = "/hydration-route-1";
        const capture = installCapture();

        useContentQuery(() => [], sharedOptions);
        await flushPromises();

        // The capture must have recorded at least one cache entry for this route — this
        // guards the attribution/prefix path that the inline seed script depends on.
        const forRoute = capture.cache["/hydration-route-1"] ?? {};
        expect(Object.keys(forRoute).length).toBeGreaterThan(0);

        // Snapshot the exact entries the prerender attributed to this route, so any change
        // to the cache key shape or seeded payload is visible in the diff.
        expect(forRoute).toMatchInlineSnapshot(`
          {
            "hqcache:ukl9y7": "{"local":[{"_id":"content-1","type":"content","updatedTimeUtc":1000,"parentId":"parent-1","title":"Title"}],"remote":[]}",
          }
        `);

        // Simulate the inline <script> from vite.config.web.ts: clear the prerender's
        // localStorage, then replay the captured entries exactly as the build does.
        localStorage.clear();
        for (const [k, v] of Object.entries(forRoute)) {
            localStorage.setItem(k, v);
        }

        // --- Hydrating client leg ---
        (import.meta.env as { SSR: boolean }).SSR = false;

        // The no-flash guarantee: the client's FIRST render reads the seed synchronously
        // through the real shared HybridQuery, before any local/remote read resolves. Do
        // NOT await anything before this assertion — awaiting would hide a seed-read
        // ordering regression.
        const scope = effectScope();
        scope.run(() => {
            const output = useContentQuery(() => [], sharedOptions);
            expect(output.value.length).toBeGreaterThan(0);
        });
        scope.stop();
    });

    it("the client reads back exactly the storage keys the prerender wrote", async () => {
        routeMock.path = "/hydration-route-2";
        const capture = installCapture();

        useContentQuery(() => [], sharedOptions);
        await flushPromises();

        // Derive both key sets from runtime values: the real writeResponseCache wrote
        // whatever keys are now in localStorage (cleared in beforeEach, so these are
        // exclusively the cache entries), and the capture attributed whatever keys it
        // recorded for this route. Comparing the two sets pins the app's duplicated
        // "hqcache:" prefix literal against the shared STORAGE_PREFIX constant without
        // re-duplicating the literal here.
        const lsKeys = localStorageKeys().sort();
        const capturedKeys = Object.keys(capture.cache["/hydration-route-2"] ?? {}).sort();

        expect(lsKeys).toEqual(capturedKeys);
    });

    it("an authenticated client does not paint the anonymous prerendered seed", async () => {
        // --- Prerender leg (always anonymous) ---
        routeMock.path = "/hydration-route-3";
        const capture = installCapture();

        useContentQuery(() => [], sharedOptions);
        await flushPromises();

        const forRoute = capture.cache["/hydration-route-3"] ?? {};
        expect(Object.keys(forRoute).length).toBeGreaterThan(0);

        // Replay the anonymous seed exactly as the inline script does.
        localStorage.clear();
        for (const [k, v] of Object.entries(forRoute)) {
            localStorage.setItem(k, v);
        }

        // --- Hydrating client leg (authenticated) ---
        (import.meta.env as { SSR: boolean }).SSR = false;
        // The build always seeds the :anon entry; a returning logged-in client scopes its
        // cache key to :auth, so readResponseCache misses and the first render stays empty
        // rather than flashing the public seed.
        hasPersistedSessionMock.mockReturnValue(true);

        const scope = effectScope();
        scope.run(() => {
            const output = useContentQuery(() => [], sharedOptions);
            expect(output.value).toEqual([]);
        });
        scope.stop();
    });
});
