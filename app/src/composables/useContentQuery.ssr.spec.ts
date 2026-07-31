import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { DocType, structuralCacheKey, type ContentDto } from "luminary-shared";

// Mock `onServerPrefetch` to invoke its callback immediately, reproducing what a real SSR render does (the callback is awaited before the page is serialized) without a full component harness.
vi.mock("vue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("vue")>();
    return { ...actual, onServerPrefetch: (cb: () => unknown) => cb() };
});

const queryRemoteMock = vi.fn();
const writeResponseCacheMock = vi.fn();

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return {
        ...actual,
        queryRemote: (...args: unknown[]) => queryRemoteMock(...args),
        writeResponseCache: (...args: unknown[]) => writeResponseCacheMock(...args),
    };
});

const hasPersistedSessionMock = vi.fn(() => false);
vi.mock("@/auth", () => ({ hasPersistedSession: () => hasPersistedSessionMock() }));

import { useContentQuery } from "./useContentQuery";

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

describe("useContentQuery — SSR prerender path", () => {
    beforeEach(() => {
        queryRemoteMock.mockReset().mockResolvedValue([{ ...fakeDoc }]);
        writeResponseCacheMock.mockReset();
        hasPersistedSessionMock.mockReset().mockReturnValue(false);
        localStorage.clear();
        (import.meta.env as { SSR: boolean }).SSR = true;
    });

    afterEach(() => {
        (import.meta.env as { SSR: boolean }).SSR = false;
    });

    it("fetches via queryRemote and exposes the docs stripped of the default stripFields", async () => {
        const out = useContentQuery(() => [], { publishedFilter: false, languageFilter: false });
        await flushPromises();

        expect(queryRemoteMock).toHaveBeenCalledTimes(1);
        expect(out.value).toEqual([
            {
                _id: "content-1",
                type: DocType.Content,
                updatedTimeUtc: 1000,
                parentId: "parent-1",
                title: "Title",
            },
        ]);
    });

    it("respects a custom stripFields override on the live output", async () => {
        const out = useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            stripFields: ["fts", "ftsTokenCount", "_rev"],
        });
        await flushPromises();

        // memberOf/text kept (SingleContent's own override), fts/ftsTokenCount/_rev gone.
        expect(out.value[0]).toMatchObject({ text: "<p>Full body</p>", memberOf: ["group-1"] });
        expect(out.value[0]).not.toHaveProperty("fts");
        expect(out.value[0]).not.toHaveProperty("_rev");
    });

    it("writes the response cache once per fetch, scoped :anon regardless of session state", async () => {
        hasPersistedSessionMock.mockReturnValue(true); // SSR is always anonymous either way
        useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            cacheId: "single-slug",
        });
        await flushPromises();

        expect(writeResponseCacheMock).toHaveBeenCalledTimes(1);
        const [key, window, limit, stripFields] = writeResponseCacheMock.mock.calls[0];
        const expectedQuery = {
            selector: { $and: [{ type: DocType.Content }] },
            use_index: "content-publishDate-index",
        };
        expect(key).toBe(structuralCacheKey(expectedQuery, "single-slug:anon"));
        expect(window).toEqual({
            local: [
                {
                    _id: "content-1",
                    type: DocType.Content,
                    updatedTimeUtc: 1000,
                    parentId: "parent-1",
                    title: "Title",
                },
            ],
            remote: [],
        });
        expect(limit).toBeUndefined();
        expect(stripFields).toBeUndefined(); // neither ssrCacheStripFields nor cacheStripFields passed
    });

    it("strips ssrCacheStripFields from the cache write ONLY — the live output keeps the field", async () => {
        const out = useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            stripFields: ["fts", "ftsTokenCount", "_rev"], // SingleContent's own live-output override
            ssrCacheStripFields: ["text"],
        });
        await flushPromises();

        expect(out.value[0].text).toBe("<p>Full body</p>");

        const [, , , stripFields] = writeResponseCacheMock.mock.calls[0];
        expect(stripFields).toEqual(["text"]);
    });

    it("falls back to cacheStripFields for the SSR write when ssrCacheStripFields is not given", async () => {
        useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            cacheStripFields: ["fts"],
        });
        await flushPromises();

        const [, , , stripFields] = writeResponseCacheMock.mock.calls[0];
        expect(stripFields).toEqual(["fts"]);
    });

    it("ssrCacheStripFields overrides (not merges with) cacheStripFields for the SSR write", async () => {
        useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            cacheStripFields: ["fts"],
            ssrCacheStripFields: ["text"],
        });
        await flushPromises();

        const [, , , stripFields] = writeResponseCacheMock.mock.calls[0];
        expect(stripFields).toEqual(["text"]);
    });

    // End-to-end (no writeResponseCache mock): proves the localStorage entry a real
    // build inlines into the page is actually missing `text`, not just that the right
    // args were handed to a mocked writer.
    it("end-to-end: the persisted response-cache entry omits ssrCacheStripFields", async () => {
        vi.doUnmock("luminary-shared");
        vi.resetModules();
        vi.doMock("luminary-shared", async (importOriginal) => {
            const actual = await importOriginal<typeof import("luminary-shared")>();
            return { ...actual, queryRemote: (...args: unknown[]) => queryRemoteMock(...args) };
        });
        vi.doMock("vue", async (importOriginal) => {
            const actual = await importOriginal<typeof import("vue")>();
            return { ...actual, onServerPrefetch: (cb: () => unknown) => cb() };
        });
        const { useContentQuery: useContentQueryReal } = await import("./useContentQuery");
        const {
            readResponseCache: readResponseCacheReal,
            structuralCacheKey: structuralCacheKeyReal,
        } = await import("luminary-shared");

        useContentQueryReal(() => [], {
            publishedFilter: false,
            languageFilter: false,
            stripFields: ["fts", "ftsTokenCount", "_rev"],
            ssrCacheStripFields: ["text"],
            cacheId: "e2e-slug",
        });
        await flushPromises();

        const expectedQuery = {
            selector: { $and: [{ type: DocType.Content }] },
            use_index: "content-publishDate-index",
        };
        const key = structuralCacheKeyReal(expectedQuery, "e2e-slug:anon");
        const seed = readResponseCacheReal<ContentDto>(key);
        expect(seed?.local[0]).not.toHaveProperty("text");
        expect(seed?.local[0]).toMatchObject({ _id: "content-1", memberOf: ["group-1"] });

        vi.resetModules();
    });

    it("reports dependency keys (doc + facet) when a capture is active", async () => {
        const capture = { current: new Set<string>(), manifest: {} as Record<string, string[]> };
        (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;

        useContentQuery(() => [{ parentId: "parent-1" }], {
            publishedFilter: false,
            languageFilter: false,
        });
        await flushPromises();

        expect([...capture.current]).toEqual(
            expect.arrayContaining(["doc:parent-1", "facet:parentId:parent-1:"]),
        );

        delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
    });

    it("serializes concurrent SSR fetches in registration order (ssrChain)", async () => {
        const order: string[] = [];
        queryRemoteMock.mockReset().mockImplementation(async (q: { use_index?: string }) => {
            // First call resolves slower than the second, on purpose.
            const delay = order.length === 0 ? 20 : 0;
            await new Promise((r) => setTimeout(r, delay));
            order.push(q.use_index ?? "");
            return [{ ...fakeDoc }];
        });

        useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            useIndex: "first-index",
        });
        useContentQuery(() => [], {
            publishedFilter: false,
            languageFilter: false,
            useIndex: "second-index",
        });

        await new Promise((r) => setTimeout(r, 50));
        await flushPromises();

        expect(order).toEqual(["first-index", "second-index"]);
    });
});
