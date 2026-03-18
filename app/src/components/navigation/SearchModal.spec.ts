import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, nextTick } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SearchModal from "./SearchModal.vue";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import type { FtsSearchResult } from "luminary-shared";

// ── Hoisted (vi.mock factories run before imports; no mockdata here) ──────────

const routePushMock = vi.hoisted(() => vi.fn());
const loadMoreMock = vi.hoisted(() => vi.fn());

/** Doc returned by db mock; _id/slug/title must match mockEnglishContentDto for assertions. */
const searchMockDoc = vi.hoisted(() => ({
    _id: "content-post1-eng",
    slug: "post1-eng",
    title: "Post 1",
    summary: "This is an example post",
    author: "ChatGPT",
    text: "In the quiet town of Willowdale, little Lily wept.",
    language: "lang-eng",
    parentPublishDateVisible: true,
}));

// ── Mocks (aligned with MobileMenu.spec / DesktopMenu.spec) ──────────────────

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({ push: routePushMock })),
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
                        toArray: vi.fn().mockResolvedValue([searchMockDoc]),
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

// ── Import after mocks ─────────────────────────────────────────────────────

import { useFtsSearch } from "luminary-shared";

// ── Helpers ────────────────────────────────────────────────────────────────

const runSearchMock = vi.hoisted(() => vi.fn());

/** Configure useFtsSearch return value; returns refs so tests can update after mount. */
function setupFts(opts: {
    results?: FtsSearchResult[];
    isSearching?: boolean;
    hasMore?: boolean;
    lastSearchedQuery?: string;
} = {}) {
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
    } as any);

    return { resultsRef, isSearchingRef, hasMoreRef, lastSearchedQueryRef };
}

function mountComponent() {
    return mount(SearchModal, {
        global: {
            stubs: {
                Transition: { template: "<slot />" },
                LImage: { template: "<div />" },
            },
            mocks: {
                $t: (key: string) => mockLanguageDtoEng.translations[key] ?? key,
            },
        },
    });
}

async function openOverlay() {
    const { openSearch } = useSearchOverlay();
    openSearch();
    await nextTick();
}

/** Single FTS hit for mockEnglishContentDto (reused from mockdata). */
const fakeResult: FtsSearchResult = {
    docId: mockEnglishContentDto._id,
    score: 1.5,
    wordMatchScore: 1,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SearchButton", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        setupFts();
        loadMoreMock.mockReset();
        routePushMock.mockReset();
        window.localStorage.clear();
    });

    afterEach(() => {
        // Reset the shared overlay singleton so tests don't bleed into each other
        const { closeSearch } = useSearchOverlay();
        closeSearch();
        vi.clearAllMocks();
    });

    // ── Overlay open / close ───────────────────────────────────────────────

    describe("Overlay visibility", () => {
        it("is hidden by default", () => {
            const wrapper = mountComponent();
            const input = wrapper.find("input");
            expect(input.exists()).toBe(true);
            expect(input.isVisible()).toBe(false);
        });

        it("opens when the search overlay is opened", async () => {
            const wrapper = mountComponent();
            await openOverlay();
            expect(wrapper.find("input").isVisible()).toBe(true);
        });

        it("closes when ESC is pressed on the input", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            await wrapper.find("input").trigger("keydown", { key: "Escape" });
            await flushPromises();

            expect(wrapper.find("input").isVisible()).toBe(false);
        });

        it("closes when the ESC close button is clicked", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            const closeBtn = wrapper
                .findAll("button")
                .find((b) => b.attributes("aria-label") === "Close search");
            expect(closeBtn).toBeDefined();

            await closeBtn!.trigger("click");
            await flushPromises();

            expect(wrapper.find("input").isVisible()).toBe(false);
        });

        it("opens on global Cmd+K when overlay is closed", async () => {
            const wrapper = mountComponent();

            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
            await nextTick();

            expect(wrapper.find("input").isVisible()).toBe(true);
        });

        it("selects the full previous query when opened via Cmd+K", async () => {
            // Persist a previous query before mounting
            window.localStorage.setItem("luminary-search-last-executed-query", "willowdale");

            const wrapper = mountComponent();

            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
            await nextTick();
            await flushPromises();

            const input = wrapper.find("input").element as HTMLInputElement;
            expect(input.value).toBe("willowdale");
            expect(input.selectionStart).toBe(0);
            expect(input.selectionEnd).toBe(input.value.length);
        });

        it("closes on global ESC when overlay is open", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            await flushPromises();

            expect(wrapper.find("input").isVisible()).toBe(false);
        });
    });

    // ── Empty state ────────────────────────────────────────────────────────

    describe("Empty state", () => {
        it("shows the search hint when opened with no query", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            expect(wrapper.html()).toContain("Search by title, summary, or content");
        });
    });

    describe("Recent searches focus behavior", () => {
        it("refocuses and selects the input after clicking a recent search", async () => {
            window.localStorage.setItem("luminary-search-recent", JSON.stringify(["Willowdale"]));

            const wrapper = mountComponent();
            await openOverlay();
            await flushPromises();

            const recentBtn = wrapper.findAll("button").find((b) => b.text() === "Willowdale");
            expect(recentBtn).toBeDefined();

            await recentBtn!.trigger("click");
            await flushPromises();

            const input = wrapper.find("input").element as HTMLInputElement;
            expect(input.selectionStart).toBe(0);
            expect(input.selectionEnd).toBe(input.value.length);
        });

        it("prevents arrow keys from bubbling to the page when modal is open", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            const bodySpy = vi.fn();
            document.body.addEventListener("keydown", bodySpy);

            // When modal is open, arrow keys should be contained (capture handler stops propagation).
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
            await nextTick();

            document.body.removeEventListener("keydown", bodySpy);
            expect(bodySpy).not.toHaveBeenCalled();

            // Sanity: modal still mounted
            expect(wrapper.find("input").exists()).toBe(true);
        });
    });

    // ── Min-chars hint ─────────────────────────────────────────────────────

    describe("Min-chars hint", () => {
        it("shows hint when query is 1 or 2 characters", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            await wrapper.find("input").setValue("ab");
            await nextTick();

            expect(wrapper.html()).toContain("Type at least 3 characters to search");
        });

        it("does not show min-chars hint when query is 3+ characters", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            await wrapper.find("input").setValue("abc");
            await nextTick();

            expect(wrapper.html()).not.toContain("Type at least 3 characters to search");
        });
    });

    // ── Loading state ──────────────────────────────────────────────────────

    describe("Loading state", () => {
        it("shows loading skeleton while searching", async () => {
            const { isSearchingRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();

            // Simulate a search in progress
            isSearchingRef.value = true;
            await wrapper.find("input").setValue("willowdale");
            await nextTick();

            expect(wrapper.find(".animate-pulse").exists()).toBe(true);
        });
    });

    // ── No results ─────────────────────────────────────────────────────────

    describe("No results state", () => {
        it("shows no-results message when FTS returns nothing", async () => {
            const { resultsRef, isSearchingRef, lastSearchedQueryRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();

            await wrapper.find("input").setValue("xyznotfound");
            await nextTick();

            // Simulate an executed search that returned no results
            lastSearchedQueryRef.value = "xyznotfound";
            resultsRef.value = [];
            isSearchingRef.value = false;
            await flushPromises();

            expect(wrapper.html()).toContain("No results found");
        });
    });

    // ── Results ────────────────────────────────────────────────────────────

    describe("Search results", () => {
        /**
         * Triggers a search and waits for resolvedDocs to populate.
         * Results arrive async: set the input, trigger the FTS ref change,
         * then flush promises for the db watch handler to complete.
         */
        async function triggerResults(
            wrapper: ReturnType<typeof mountComponent>,
            resultsRef: ReturnType<typeof ref<FtsSearchResult[]>>,
            query = "Willowdale",
        ) {
            await wrapper.find("input").setValue(query);
            await nextTick();
            resultsRef.value = [fakeResult];
            await flushPromises();
        }

        it("renders a result row for each FTS hit", async () => {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();
            await triggerResults(wrapper, resultsRef);

            expect(wrapper.findAll("[role='option']")).toHaveLength(1);
        });

        it("renders the title of the matched content doc", async () => {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();
            await triggerResults(wrapper, resultsRef);

            expect(wrapper.html()).toContain(mockEnglishContentDto.title);
        });

        it("highlights the query term inside the title", async () => {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();
            // "Post" matches mockEnglishContentDto.title ("Post 1")
            await triggerResults(wrapper, resultsRef, "Post");

            expect(wrapper.html()).toContain("<mark");
        });
    });

    // ── Persistence & query editing behavior ─────────────────────────────────

    describe("Persistence and query editing", () => {
        it("keeps showing previous results while user edits a non-empty query", async () => {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();

            // Initial search with one result
            await wrapper.find("input").setValue("Willow");
            await nextTick();
            resultsRef.value = [fakeResult];
            await flushPromises();
            expect(wrapper.findAll("[role='option']")).toHaveLength(1);

            // User edits query but does not clear it
            await wrapper.find("input").setValue("Willowdale");
            await nextTick();

            // Results should still be visible until an explicit new search
            expect(wrapper.findAll("[role='option']")).toHaveLength(1);
        });

        it("clears results when query is cleared to empty", async () => {
            const { resultsRef, lastSearchedQueryRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();

            // Simulate an executed search with results
            await wrapper.find("input").setValue("Willowdale");
            await nextTick();
            lastSearchedQueryRef.value = "Willowdale";
            resultsRef.value = [fakeResult];
            await flushPromises();
            expect(wrapper.findAll("[role='option']")).toHaveLength(1);

            // Clear the query
            await wrapper.find("input").setValue("");
            await nextTick();
            await flushPromises();

            expect(wrapper.findAll("[role='option']")).toHaveLength(0);
        });

        it("automatically reruns search on reopen when there is a persisted non-empty query", async () => {
            const { resultsRef, lastSearchedQueryRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();

            // Simulate a completed search
            await wrapper.find("input").setValue("Willowdale");
            await nextTick();
            lastSearchedQueryRef.value = "Willowdale";
            resultsRef.value = [fakeResult];
            await flushPromises();

            // Close overlay
            const { closeSearch, openSearch } = useSearchOverlay();
            closeSearch();
            await flushPromises();

            // Capture current call count, then reopen and assert it increases
            const beforeCalls = runSearchMock.mock.calls.length;

            // Reopen overlay; non-empty query should trigger an automatic search
            openSearch();
            await flushPromises();

            expect(runSearchMock.mock.calls.length).toBeGreaterThan(beforeCalls);
        });
    });

    // ── Clear button ───────────────────────────────────────────────────────

    describe("Clear query button", () => {
        it("clears the input when the clear button is clicked", async () => {
            const wrapper = mountComponent();
            await openOverlay();

            const input = wrapper.find("input");
            await input.setValue("hello");
            await nextTick();

            const clearBtn = wrapper
                .findAll("button")
                .find((b) => b.attributes("aria-label") === "Clear search query");
            expect(clearBtn).toBeDefined();

            await clearBtn!.trigger("click");
            await nextTick();

            expect((input.element as HTMLInputElement).value).toBe("");
        });
    });

    // ── Navigation on result click ─────────────────────────────────────────

    describe("Navigation on result click", () => {
        async function setupWithResults() {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();
            await wrapper.find("input").setValue("Willowdale");
            await nextTick();
            resultsRef.value = [fakeResult];
            await flushPromises();
            return wrapper;
        }

        it("navigates to the content route when a result is clicked", async () => {
            const wrapper = await setupWithResults();

            await wrapper.find("[role='option']").trigger("click");
            await nextTick();

            expect(routePushMock).toHaveBeenCalledWith({
                name: "content",
                params: { slug: mockEnglishContentDto.slug },
            });
        });

        it("closes the overlay after navigating", async () => {
            const wrapper = await setupWithResults();

            await wrapper.find("[role='option']").trigger("click");
            await flushPromises();

            expect(wrapper.find("input").isVisible()).toBe(false);
        });
    });

    // ── Keyboard navigation in results ─────────────────────────────────────

    describe("Keyboard navigation", () => {
        const twoResults: FtsSearchResult[] = [
            { docId: mockEnglishContentDto._id, score: 2, wordMatchScore: 1 },
            { docId: mockEnglishContentDto._id, score: 1, wordMatchScore: 1 },
        ];

        async function setupWithTwoResults() {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();
            await wrapper.find("input").setValue("Post");
            await nextTick();
            resultsRef.value = twoResults;
            await flushPromises();
            return wrapper;
        }

        it("moves selection down on ArrowDown", async () => {
            const wrapper = await setupWithTwoResults();

            await wrapper.find("input").trigger("keydown", { key: "ArrowDown" });
            await nextTick();

            const items = wrapper.findAll("[role='option']");
            expect(items[1].attributes("aria-selected")).toBe("true");
        });

        it("moves selection back up on ArrowUp", async () => {
            const wrapper = await setupWithTwoResults();

            await wrapper.find("input").trigger("keydown", { key: "ArrowDown" });
            await wrapper.find("input").trigger("keydown", { key: "ArrowUp" });
            await nextTick();

            const items = wrapper.findAll("[role='option']");
            expect(items[0].attributes("aria-selected")).toBe("true");
        });

        it("navigates to the selected result on Enter", async () => {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();
            await wrapper.find("input").setValue("Post");
            await nextTick();
            resultsRef.value = [fakeResult];
            await flushPromises();

            await wrapper.find("input").trigger("keydown", { key: "Enter" });
            await nextTick();

            expect(routePushMock).toHaveBeenCalledWith({
                name: "content",
                params: { slug: mockEnglishContentDto.slug },
            });
        });

        it("does not reset selection to first result when more results are loaded", async () => {
            const { resultsRef } = setupFts();
            const wrapper = mountComponent();
            await openOverlay();

            // Initial query with two results
            await wrapper.find("input").setValue("Post");
            await nextTick();
            resultsRef.value = twoResults;
            await flushPromises();

            // Move selection to the second result
            await wrapper.find("input").trigger("keydown", { key: "ArrowDown" });
            await nextTick();
            let items = wrapper.findAll("[role='option']");
            expect(items[1].attributes("aria-selected")).toBe("true");

            // Load one more result (simulate infinite scroll loadMore)
            resultsRef.value = [...twoResults, twoResults[0]];
            await flushPromises();

            // Selection should remain on the same (second) item, not jump back to the top
            items = wrapper.findAll("[role='option']");
            expect(items[1].attributes("aria-selected")).toBe("true");
        });
    });
});
