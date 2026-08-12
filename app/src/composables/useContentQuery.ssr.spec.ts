import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { DocType, PublishStatus, structuralCacheKey, type ContentDto } from "luminary-shared";

// Mock `onServerPrefetch` to invoke its callback immediately, reproducing what a real SSR render does (the callback is awaited before the page is serialized) without a full component harness.
vi.mock("vue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("vue")>();
    return { ...actual, onServerPrefetch: (cb: () => unknown) => cb() };
});

// The real prerender reads the route off the router vite-ssg has already pushed to the page
// being rendered; this harness calls the composable directly, so stand in a settable route.
const routeMock = vi.hoisted(() => ({ path: "/test-route" }));
vi.mock("vue-router", () => ({ useRoute: () => routeMock }));

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

// A doc that satisfies the `mangoIsPublished([], { includeScheduled: false })` clause
// (status Published, past publishDate, no expiry) so the local corpus resolver returns it.
const publishedCorpusDoc = {
    _id: "content-pub-1",
    type: DocType.Content,
    status: PublishStatus.Published,
    publishDate: 1_000_000, // comfortably in the past relative to sessionNow()
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
            cache: true,
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
            cache: true,
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
            cache: true,
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
            cache: true,
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
            cache: true,
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

    // Regression: the SSR branch must attribute the seed to its route under the FULL
    // `hqcache:`-prefixed storage key (the one shared writes and the client reads), not
    // the bare structural cacheKey. A bare-key attribution read back null, so the seed
    // was never inlined into the page HTML — the logged-out 404-flash root cause.
    it("attributes the response-cache seed to its route under the hqcache: prefixed key", async () => {
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
        const { structuralCacheKey: structuralCacheKeyReal } = await import("luminary-shared");

        const capture = {
            manifest: {} as Record<string, Set<string>>,
            cache: {} as Record<string, Record<string, string>>,
        };
        (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;
        routeMock.path = "/prefixed-seed-route";

        useContentQueryReal(() => [], {
            publishedFilter: false,
            languageFilter: false,
            cache: true,
            cacheId: "prefixed-slug",
        });
        await flushPromises();

        const expectedQuery = {
            selector: { $and: [{ type: DocType.Content }] },
            use_index: "content-publishDate-index",
        };
        const cacheKey = structuralCacheKeyReal(expectedQuery, "prefixed-slug:anon");
        const storageKey = "hqcache:" + cacheKey;
        const forRoute = capture.cache["/prefixed-seed-route"] ?? {};
        expect(Object.keys(forRoute)).toContain(storageKey);
        // The attributed value is the JSON the inline seed replays into localStorage, so
        // the client's readResponseCache(cacheKey) (= getItem("hqcache:" + cacheKey)) hits.
        const seeded = JSON.parse(forRoute[storageKey]) as { local: unknown[]; remote: unknown[] };
        expect(seeded.local).toHaveLength(1);
        expect(seeded.remote).toEqual([]);

        routeMock.path = "/test-route";
        delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
        vi.resetModules();
    });

    it("reports dependency keys (doc + facet) under the route being rendered", async () => {
        const capture = {
            manifest: {} as Record<string, Set<string>>,
            cache: {} as Record<string, Record<string, string>>,
        };
        (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;
        routeMock.path = "/some-slug";

        useContentQuery(() => [{ parentId: "parent-1" }], {
            publishedFilter: false,
            languageFilter: false,
        });
        await flushPromises();

        expect([...capture.manifest["/some-slug"]]).toEqual(
            expect.arrayContaining(["doc:parent-1", "facet:parentId:parent-1:"]),
        );

        routeMock.path = "/test-route";
        delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
    });

    it("keeps keys and cache seeds of concurrently-rendered routes apart", async () => {
        const capture = {
            manifest: {} as Record<string, Set<string>>,
            cache: {} as Record<string, Record<string, string>>,
        };
        (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;

        // Two pages rendering at once: each composable captures its own route at setup, so the
        // interleaved prefetches below must not cross-attribute.
        routeMock.path = "/page-a";
        useContentQuery(() => [{ parentId: "parent-a" }], {
            publishedFilter: false,
            languageFilter: false,
        });
        routeMock.path = "/page-b";
        useContentQuery(() => [{ parentId: "parent-b" }], {
            publishedFilter: false,
            languageFilter: false,
        });
        await flushPromises();

        expect([...capture.manifest["/page-a"]]).toContain("doc:parent-1");
        expect([...capture.manifest["/page-a"]]).toContain("facet:parentId:parent-a:");
        expect([...capture.manifest["/page-a"]]).not.toContain("facet:parentId:parent-b:");
        expect([...capture.manifest["/page-b"]]).toContain("facet:parentId:parent-b:");
        expect([...capture.manifest["/page-b"]]).not.toContain("facet:parentId:parent-a:");

        routeMock.path = "/test-route";
        delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
    });

    it("serializes SSR fetches within one route in registration order (per-route chain)", async () => {
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

    it("short-circuits a provably-empty selector without calling queryRemote", async () => {
        queryRemoteMock.mockReset().mockResolvedValue([{ ...fakeDoc }]);
        const out = useContentQuery(() => [{ parentId: { $in: [] } }], {
            publishedFilter: false,
            languageFilter: false,
        });
        await flushPromises();

        expect(queryRemoteMock).not.toHaveBeenCalled();
        expect(writeResponseCacheMock).not.toHaveBeenCalled();
        expect(out.value).toEqual([]);
    });

    describe("buildOnce", () => {
        it("fetches the query once for the whole build, across different routes", async () => {
            queryRemoteMock.mockReset().mockResolvedValue([{ ...fakeDoc }]);

            routeMock.path = "/build-once-a";
            const first = useContentQuery(() => [], {
                publishedFilter: false,
                languageFilter: false,
                cacheId: "shared-build-once-1",
                buildOnce: true,
            });
            routeMock.path = "/build-once-b";
            const second = useContentQuery(() => [], {
                publishedFilter: false,
                languageFilter: false,
                cacheId: "shared-build-once-1",
                buildOnce: true,
            });
            await flushPromises();

            expect(queryRemoteMock).toHaveBeenCalledTimes(1);
            expect(first.value).toEqual(second.value);

            routeMock.path = "/test-route";
        });

        it("still reports dependency keys per route even though the fetch is shared", async () => {
            queryRemoteMock.mockReset().mockResolvedValue([{ ...fakeDoc }]);
            const capture = {
                manifest: {} as Record<string, Set<string>>,
                cache: {} as Record<string, Record<string, string>>,
            };
            (globalThis as Record<string, unknown>).__SSG_DEPS__ = capture;

            routeMock.path = "/build-once-c";
            useContentQuery(() => [], {
                publishedFilter: false,
                languageFilter: false,
                cacheId: "shared-build-once-2",
                buildOnce: true,
            });
            routeMock.path = "/build-once-d";
            useContentQuery(() => [], {
                publishedFilter: false,
                languageFilter: false,
                cacheId: "shared-build-once-2",
                buildOnce: true,
            });
            await flushPromises();

            expect(queryRemoteMock).toHaveBeenCalledTimes(1);
            expect([...(capture.manifest["/build-once-c"] ?? [])]).toContain("doc:parent-1");
            expect([...(capture.manifest["/build-once-d"] ?? [])]).toContain("doc:parent-1");

            routeMock.path = "/test-route";
            delete (globalThis as Record<string, unknown>).__SSG_DEPS__;
        });

        it("resolves without waiting on a slow sibling chained query on the same route", async () => {
            const order: string[] = [];
            queryRemoteMock.mockReset().mockImplementation(async (q: { use_index?: string }) => {
                if (q.use_index === "slow-chained-index") {
                    await new Promise((r) => setTimeout(r, 30));
                    order.push("chained");
                } else {
                    order.push("build-once");
                }
                return [{ ...fakeDoc }];
            });

            routeMock.path = "/build-once-e";
            // Registered first but slow — if buildOnce queries were still stuck behind
            // the per-route chain, "build-once" would only appear after "chained".
            useContentQuery(() => [], {
                publishedFilter: false,
                languageFilter: false,
                useIndex: "slow-chained-index",
            });
            useContentQuery(() => [], {
                publishedFilter: false,
                languageFilter: false,
                cacheId: "shared-build-once-3",
                buildOnce: true,
            });

            await new Promise((r) => setTimeout(r, 50));
            await flushPromises();

            expect(order).toEqual(["build-once", "chained"]);

            routeMock.path = "/test-route";
        });
    });

    describe("build-time content store (local corpus) fallback", () => {
        const CORPUS_KEY = "__SSG_CONTENT_CORPUS__";

        afterEach(() => {
            delete (globalThis as Record<string, unknown>)[CORPUS_KEY];
        });

        // `publishedFilter` is the gate: the selector bounds results to the published set
        // (publishDate <= now OR coming-soon) the drained corpus holds, so it can answer
        // locally. A present corpus with no match is authoritative — never re-POSTs — so a
        // feed can't surface a tile for a slug page that was never prerendered.
        it("serves a corpus-satisfiable query locally without calling queryRemote", async () => {
            (globalThis as Record<string, unknown>)[CORPUS_KEY] = [{ ...publishedCorpusDoc }];
            const out = useContentQuery(() => [{ parentId: "parent-1" }], {
                publishedFilter: true,
                languageFilter: false,
                includeScheduled: false,
            });
            await flushPromises();

            expect(queryRemoteMock).not.toHaveBeenCalled();
            expect(out.value).toHaveLength(1);
            expect(out.value[0]._id).toBe("content-pub-1");
            // The default stripFields still apply on the locally-served path.
            expect(out.value[0]).not.toHaveProperty("text");
        });

        // A feed query (publishedFilter: true, default truthy includeScheduled) must read
        // from the corpus — the prior gate forced these onto the live API, so a doc
        // published mid-build appeared as a feed tile with no prerendered slug page.
        it("serves a feed query (default includeScheduled) locally without calling queryRemote", async () => {
            (globalThis as Record<string, unknown>)[CORPUS_KEY] = [{ ...publishedCorpusDoc }];
            const out = useContentQuery(() => [{ parentId: "parent-1" }], {
                publishedFilter: true,
                languageFilter: false,
                // includeScheduled intentionally omitted — the feed default (truthy).
            });
            await flushPromises();

            expect(queryRemoteMock).not.toHaveBeenCalled();
            expect(out.value).toHaveLength(1);
            expect(out.value[0]._id).toBe("content-pub-1");
        });

        // The dead-link guard: a present corpus with no match is AUTHORITATIVE. Re-POSTing
        // would let a doc the live API surfaces (but the drain didn't) render a feed tile
        // to a slug page that was never prerendered.
        it("does not fall back to queryRemote when the corpus is present but matches nothing", async () => {
            (globalThis as Record<string, unknown>)[CORPUS_KEY] = [{ ...publishedCorpusDoc }];
            const out = useContentQuery(() => [{ parentId: "not-in-corpus" }], {
                publishedFilter: true,
                languageFilter: false,
            });
            await flushPromises();

            expect(queryRemoteMock).not.toHaveBeenCalled();
            expect(out.value).toEqual([]);
        });

        // The corpus carries coming-soon docs too; a feed query matches one via the
        // parentShowComingSoon branch and serves it locally (as a non-link tile).
        it("serves a coming-soon doc from the corpus for a feed query", async () => {
            const comingSoonDoc = {
                ...publishedCorpusDoc,
                _id: "content-soon",
                publishDate: Date.now() + 60_000, // future relative to the frozen sessionNow()
                parentShowComingSoon: true,
            };
            (globalThis as Record<string, unknown>)[CORPUS_KEY] = [comingSoonDoc];
            const out = useContentQuery(() => [{ parentId: "parent-1" }], {
                publishedFilter: true,
                languageFilter: false,
                // includeScheduled omitted — the feed default matches coming-soon.
            });
            await flushPromises();

            expect(queryRemoteMock).not.toHaveBeenCalled();
            expect(out.value).toHaveLength(1);
            expect(out.value[0]._id).toBe("content-soon");
        });

        it("falls back to queryRemote when the query is not corpus-satisfiable (publishedFilter:false)", async () => {
            (globalThis as Record<string, unknown>)[CORPUS_KEY] = [{ ...publishedCorpusDoc }];
            useContentQuery(() => [{ parentId: "parent-1" }], {
                publishedFilter: false,
                languageFilter: false,
            });
            await flushPromises();

            expect(queryRemoteMock).toHaveBeenCalledTimes(1);
        });

        it("falls back to queryRemote when no corpus has been published", async () => {
            delete (globalThis as Record<string, unknown>)[CORPUS_KEY];
            useContentQuery(() => [{ parentId: "parent-1" }], {
                publishedFilter: true,
                languageFilter: false,
                includeScheduled: false,
            });
            await flushPromises();

            expect(queryRemoteMock).toHaveBeenCalledTimes(1);
        });
    });
});
