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

    it("defaults fetchUnsyncedFallback to true and forwards an override", () => {
        useContentQuery(() => []);
        expect(lastOptions().fetchUnsyncedFallback).toBe(true);

        useContentQuery(() => [], { fetchUnsyncedFallback: false });
        expect(lastOptions().fetchUnsyncedFallback).toBe(false);
    });
});
