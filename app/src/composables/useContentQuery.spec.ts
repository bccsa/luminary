import { describe, it, expect, vi, beforeEach } from "vitest";

// Replace only useHybridQuery with a spy; keep DocType/types real so the wrapper's
// query-building still type-checks and runs.
const useHybridQueryMock = vi.fn(
    (_query?: unknown, _options?: Record<string, unknown>) => ({ value: [] as unknown[] }),
);

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return new Proxy(actual, {
        get(target, prop) {
            if (prop === "useHybridQuery") return useHybridQueryMock;
            return (target as Record<string | symbol, unknown>)[prop];
        },
    });
});

const hasPersistedSessionMock = vi.fn(() => false);
vi.mock("@/auth", () => ({
    hasPersistedSession: () => hasPersistedSessionMock(),
}));

import { useContentQuery } from "./useContentQuery";

describe("useContentQuery", () => {
    beforeEach(() => {
        useHybridQueryMock.mockClear();
        hasPersistedSessionMock.mockReset().mockReturnValue(false);
    });

    const lastOptions = () =>
        (useHybridQueryMock.mock.calls.at(-1)![1] ?? {}) as Record<string, unknown>;

    it("defaults stripFields to the heavy / never-rendered content fields (heap + cache)", () => {
        useContentQuery(() => [], { cache: true });
        expect(lastOptions().stripFields).toEqual([
            "fts",
            "ftsTokenCount",
            "text",
            "memberOf",
            "_rev",
        ]);
    });

    it("forwards an explicit stripFields override", () => {
        useContentQuery(() => [], { stripFields: ["fts", "ftsTokenCount", "_rev"] });
        expect(lastOptions().stripFields).toEqual(["fts", "ftsTokenCount", "_rev"]);
    });

    it("keeps the live / cache / persistOffline defaults", () => {
        useContentQuery(() => []);
        const o = lastOptions();
        expect(o.live).toBe(true);
        expect(o.cache).toBe(false);
        expect(o.persistOffline).toBe(true);
    });

    // ssrCacheStripFields only affects the SSR-authored response-cache write
    // (onServerPrefetch, not exercised outside a real SSR build) — here we only need
    // to prove it never leaks into the client-side HybridQuery options, which would
    // otherwise strip it from the client's own ongoing re-cache writes too.
    it("does not forward ssrCacheStripFields to the client HybridQuery options", () => {
        useContentQuery(() => [], { cache: true, ssrCacheStripFields: ["text"] });
        const o = lastOptions();
        expect(o.ssrCacheStripFields).toBeUndefined();
        expect(o.cacheStripFields).toBeUndefined();
    });

    it("keeps cacheStripFields separate from ssrCacheStripFields on the client options", () => {
        useContentQuery(() => [], {
            cache: true,
            cacheStripFields: ["fts"],
            ssrCacheStripFields: ["text"],
        });
        const o = lastOptions();
        expect(o.cacheStripFields).toEqual(["fts"]);
        expect(o.ssrCacheStripFields).toBeUndefined();
    });

    // Response-cache auth scoping — fix for "flash of public content" on reload
    // while logged in (the SSG build always seeds the `:anon` entry; a returning
    // authenticated client must read/write a distinct `:auth` entry instead).
    describe("cacheId auth scoping", () => {
        it("suffixes an anonymous client's cacheId with :anon", () => {
            hasPersistedSessionMock.mockReturnValue(false);
            useContentQuery(() => [], { cache: true, cacheId: "home-pinned" });
            expect(lastOptions().cacheId).toBe("home-pinned:anon");
        });

        it("suffixes a logged-in client's cacheId with :auth", () => {
            hasPersistedSessionMock.mockReturnValue(true);
            useContentQuery(() => [], { cache: true, cacheId: "home-pinned" });
            expect(lastOptions().cacheId).toBe("home-pinned:auth");
        });

        it("does not leak the literal string 'undefined' when no cacheId is passed", () => {
            hasPersistedSessionMock.mockReturnValue(false);
            useContentQuery(() => [], { cache: true });
            expect(lastOptions().cacheId).toBe(":anon");
        });
    });
});
