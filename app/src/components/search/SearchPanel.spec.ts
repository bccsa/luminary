import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, nextTick } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SearchPanel from "./SearchPanel.vue";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import type { FtsSearchResult } from "luminary-shared";

// ── Hoisted (vi.mock factories run before imports; no mockdata here) ──────────

const routeReplaceMock = vi.hoisted(() => vi.fn());
const routePushMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => ({
    name: "search" as string | symbol,
    path: "/search",
    query: {} as Record<string, string>,
}));
const loadMoreMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());
const runSearchMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({ push: routePushMock, replace: routeReplaceMock })),
    useRoute: vi.fn().mockImplementation(() => routeMock),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return {
        ...actual,
        useFtsSearch: vi.fn(),
        db: {
            docs: {
                where: vi.fn().mockReturnValue({
                    anyOf: vi.fn().mockReturnValue({
                        toArray: vi.fn().mockResolvedValue([]),
                    }),
                }),
            },
        },
    };
});

vi.mock("@vueuse/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@vueuse/core")>();
    return { ...actual, useInfiniteScroll: vi.fn() };
});

import { useFtsSearch } from "luminary-shared";

// ── Helpers ────────────────────────────────────────────────────────────────

function setupFts(
    opts: {
        results?: FtsSearchResult[];
        isSearching?: boolean;
        hasMore?: boolean;
        lastSearchedQuery?: string;
    } = {},
) {
    const resultsRef = ref<FtsSearchResult[]>(opts.results ?? []);
    const isSearchingRef = ref(opts.isSearching ?? false);
    const hasMoreRef = ref(opts.hasMore ?? false);
    const lastSearchedQueryRef = ref(opts.lastSearchedQuery ?? "");

    vi.mocked(useFtsSearch).mockReturnValue({
        results: resultsRef,
        isSearching: isSearchingRef,
        hasMore: hasMoreRef,
        loadMore: loadMoreMock,
        totalLoaded: ref(0),
        lastSearchedQuery: lastSearchedQueryRef,
        runSearch: runSearchMock,
        cancel: cancelMock,
        reset: resetMock,
        isPartial: ref(false),
    } as any);

    return { resultsRef, isSearchingRef, hasMoreRef, lastSearchedQueryRef };
}

let wrapper: ReturnType<typeof mount> | null = null;

function mountPage() {
    wrapper?.unmount();
    wrapper = mount(SearchPanel, {
        props: { mode: "page" },
        global: {
            stubs: {
                LImage: { template: "<div />" },
            },
        },
    });
    return wrapper;
}

beforeEach(() => {
    setActivePinia(createTestingPinia());
    setupFts();
    loadMoreMock.mockReset();
    cancelMock.mockReset();
    resetMock.mockReset();
    runSearchMock.mockReset();
    routeReplaceMock.mockReset();
    routePushMock.mockReset();
    routeMock.name = "search";
    routeMock.path = "/search";
    routeMock.query = {};
    window.localStorage.clear();
    window.sessionStorage.clear();
    // Desktop width so isMobileScreen is false (autofocus path).
    window.innerWidth = 1024;
    window.dispatchEvent(new Event("resize"));
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    const { closeSearch } = useSearchOverlay();
    closeSearch();
    vi.clearAllMocks();
});

describe("SearchPanel (page mode — /search)", () => {
    it("populates the input and runs the search when /search?q is present", async () => {
        routeMock.query = { q: "public search" };
        mountPage();

        await flushPromises();
        await nextTick();

        expect((wrapper!.find("input").element as HTMLInputElement).value).toBe("public search");
        expect(runSearchMock).toHaveBeenCalled();
    });

    it("does not run a search when the URL has no q", async () => {
        mountPage();

        await flushPromises();
        await nextTick();

        expect((wrapper!.find("input").element as HTMLInputElement).value).toBe("");
        expect(runSearchMock).not.toHaveBeenCalled();
    });

    it("writes the executed query back to the URL via router.replace", async () => {
        const { lastSearchedQueryRef } = setupFts();
        mountPage();

        await wrapper!.find("input").setValue("willowdale");
        await nextTick();
        // Simulate the search executing for this query.
        lastSearchedQueryRef.value = "willowdale";
        await flushPromises();

        expect(routeReplaceMock).toHaveBeenCalledWith({ query: { q: "willowdale" } });
    });

    it("drops the q param when the query is cleared", async () => {
        const { lastSearchedQueryRef } = setupFts();
        mountPage();

        await wrapper!.find("input").setValue("willowdale");
        await nextTick();
        lastSearchedQueryRef.value = "willowdale";
        await flushPromises();
        // Simulate the replace having landed in the URL (the mocked router doesn't mutate
        // route.query itself), so the clear-path equality guard sees a real previous value.
        routeMock.query = { q: "willowdale" };
        routeReplaceMock.mockClear();

        await wrapper!.find("input").setValue("");
        await nextTick();
        await flushPromises();

        expect(routeReplaceMock).toHaveBeenCalledWith({ query: {} });
    });

    it("does not render the modal close button", () => {
        mountPage();
        const closeBtn = wrapper!
            .findAll("button")
            .find((b) => b.attributes("aria-label") === "Close search");
        expect(closeBtn).toBeUndefined();
    });

    it("clears the query on Escape instead of closing an overlay", async () => {
        mountPage();
        await wrapper!.find("input").setValue("hello");
        await nextTick();

        await wrapper!.find("input").trigger("keydown", { key: "Escape" });
        await flushPromises();

        expect((wrapper!.find("input").element as HTMLInputElement).value).toBe("");
        // The search overlay must NOT have been toggled by Escape in page mode.
        expect(wrapper!.find("input").exists()).toBe(true);
    });
});