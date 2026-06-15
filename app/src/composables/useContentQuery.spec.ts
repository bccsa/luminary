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

import { useContentQuery } from "./useContentQuery";

describe("useContentQuery", () => {
    beforeEach(() => useHybridQueryMock.mockClear());

    const lastOptions = () =>
        (useHybridQueryMock.mock.calls.at(-1)![1] ?? {}) as Record<string, unknown>;

    it("defaults cacheStripFields to the heavy, never-rendered content fields", () => {
        useContentQuery(() => [], { cache: true });
        expect(lastOptions().cacheStripFields).toEqual(["fts", "ftsTokenCount", "text"]);
    });

    it("forwards an explicit cacheStripFields override", () => {
        useContentQuery(() => [], { cache: true, cacheStripFields: ["fts"] });
        expect(lastOptions().cacheStripFields).toEqual(["fts"]);
    });

    it("keeps the live / cache / persistOffline defaults", () => {
        useContentQuery(() => []);
        const o = lastOptions();
        expect(o.live).toBe(true);
        expect(o.cache).toBe(false);
        expect(o.persistOffline).toBe(true);
    });
});
