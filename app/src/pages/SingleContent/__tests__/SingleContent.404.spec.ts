import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SingleContent from "../SingleContent.vue";
import DropdownMenu from "@/components/common/DropdownMenu.vue";
import {
    mockPostDto,
    mockEnglishContentDto,
    mockCategoryContentDto,
    mockLanguageDtoFra,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockCategoryDto,
    mockTopicContentDto,
    mockTopicDto,
    mockRedirectDto,
} from "@/tests/mockdata";
import { db, isConnected, config, DocType, type ContentDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef, cmsLanguages } from "@/globalConfig";
import NotFoundPage from "../../NotFoundPage.vue";
import { ref } from "vue";
import * as auth from "@/auth";

// The not-found redirect probe (queryRemote) would otherwise hit the real (unreachable
// in tests) API and its failure timing is not deterministic — mock it to resolve
// immediately with no match so tests that flip `isConnected` mid-test aren't at the
// mercy of real network timing. Replicates the global vitest.setup.ts mangoToDexie
// mock verbatim (a per-file vi.mock of "luminary-shared" replaces it, not merges).
const queryRemoteMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    const mangoToDexieMock = async <T>(
        table: { filter: (fn: (d: unknown) => boolean) => { toArray(): Promise<T[]> } },
        query: {
            selector: unknown;
            $sort?: Array<Record<string, "asc" | "desc">>;
            $limit?: number;
        },
    ) => {
        const pred = actual.mangoCompile(
            query.selector as Parameters<typeof actual.mangoCompile>[0],
        );
        let result = await table.filter((doc: unknown) => pred(doc)).toArray();
        const sort = Array.isArray(query?.$sort) ? query.$sort[0] : undefined;
        if (sort) {
            const [field, dir] = Object.entries(sort)[0] ?? [];
            if (field != null) {
                const mult = dir === "desc" ? -1 : 1;
                result = [...result].sort((a, b) => {
                    const va = (a as Record<string, unknown>)[field] as number;
                    const vb = (b as Record<string, unknown>)[field] as number;
                    return mult * (va - vb);
                });
            }
        }
        const limit = typeof query?.$limit === "number" ? query.$limit : undefined;
        return (limit != null ? result.slice(0, limit) : result) as T[];
    };
    return new Proxy(actual, {
        get(target, prop) {
            if (prop === "mangoToDexie") return mangoToDexieMock;
            if (prop === "queryRemote") return queryRemoteMock;
            return Reflect.get(target, prop);
        },
    });
});

const routeReplaceMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        //@ts-ignore
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: ref({
                name: "content",
                params: { slug: mockEnglishContentDto.slug },
            }),
            replace: routeReplaceMock,
            back: vi.fn(),
            resolve: vi.fn().mockImplementation((to: any) => {
                if (typeof to === "string") return { href: to } as any;
                const name = to?.name ?? "";
                const slug = to?.params?.slug ? `/${to.params.slug}` : "";
                return { href: `/${name}${slug}` } as any;
            }),
            getRoutes: vi.fn().mockReturnValue([]),
        })),
    };
});
vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("SingleContent 404 Page", () => {
    let consoleErrorSpy: { mockRestore: () => void } | undefined;

    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        routeReplaceMock.mockClear();
        queryRemoteMock.mockClear();

        appLanguageIdsAsRef.value = [...appLanguageIdsAsRef.value, "lang-eng"];
        cmsLanguages.value = [];

        await db.docs.bulkPut([
            mockPostDto,
            mockCategoryDto,
            mockTopicDto,
            mockTopicContentDto,
            mockCategoryContentDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            mockRedirectDto,
        ]);

        setActivePinia(createTestingPinia());

        (auth as any).useAuth.mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        });
    });

    afterEach(async () => {
        await db.docs.clear();
        isConnected.value = false;
        config.contentPublishDateCutoff = undefined;
        queryRemoteMock.mockReset().mockResolvedValue([]);
        consoleErrorSpy?.mockRestore();
        consoleErrorSpy = undefined;
    });

    it("displays the 404 error when the content is scheduled", async () => {
        // Set a future publish date
        await db.docs.update(mockEnglishContentDto._id, {
            publishDate: Date.now() + 10000,
        } as any);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
            expect(wrapper.find("article").exists()).toBe(false);
        });
    });

    it("displays the 404 error when the content is expired", async () => {
        // Set an expired date
        await db.docs.update(mockEnglishContentDto._id, {
            publishDate: Date.now(),
            expiryDate: Date.now() - 1000,
        } as ContentDto);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
            expect(wrapper.find("article").exists()).toBe(false);
        });
    });

    it("displays the 404 error page when content has a draft status", async () => {
        await db.docs.update(mockEnglishContentDto._id, {
            status: "draft",
        } as any);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
            expect(wrapper.find("article").exists()).toBe(false);
        });
    });

    it("displays the 404 error page when routing with an invalid slug", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: "invalid-slug",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
            expect(wrapper.find("article").exists()).toBe(false);
        });
    });

    it("does not redirect to the homepage '/' when no content is found", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: "non-existent-slug",
            },
        });

        // Wait for 404 state to render
        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
            expect(wrapper.find("article").exists()).toBe(false);
        });

        // Ensure no redirect attempts to "/" or a home-like route
        expect(routeReplaceMock).not.toHaveBeenCalledWith("/");
        expect(
            routeReplaceMock.mock.calls.some((args) => {
                const firstArg = args?.[0];
                return (
                    firstArg === "/" ||
                    (typeof firstArg === "object" &&
                        firstArg?.name &&
                        /home|index/i.test(firstArg.name))
                );
            }),
        ).toBe(false);
    });

    it("does not show 404 page while content is loading", async () => {
        // This test verifies that during the brief moment when content.value is undefined
        // but isLoading is true (e.g., when switching between translations), 404 doesn't flash

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // Wait for initial content to load
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
        });

        // Track if 404 page appears at any point
        let notFoundPageAppeared = false;
        const unwatch = wrapper.vm.$watch(
            () => wrapper.findComponent(NotFoundPage).exists(),
            (exists) => {
                if (exists) notFoundPageAppeared = true;
            },
            { flush: "sync" },
        );

        try {
            // Switch to French content (same parent, different language)
            // This triggers the loading scenario where content briefly becomes undefined
            // but isLoading is true, so 404 should NOT appear
            await wrapper.setProps({ slug: mockFrenchContentDto.slug });

            // Wait for French content to load
            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockFrenchContentDto.title);
                expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
            });

            // Now switch back to English
            await wrapper.setProps({ slug: mockEnglishContentDto.slug });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockEnglishContentDto.title);
                expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
            });
        } finally {
            unwatch();
        }

        // Verify 404 never appeared during any of the transitions
        // The fix ensures check404() respects isLoading state
        expect(notFoundPageAppeared).toBe(false);
    });

    it("does not show 404 flash when switching between translations of the same content", async () => {
        // The language dropdown only lists CMS-loaded languages (no fabricated fallback),
        // so populate both translations' Language docs as a real sync would.
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // Wait until initial content (English) is rendered
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
        });
        await flushPromises();

        // Track if 404 page appears at any point during language switch
        let notFoundPageAppeared = false;
        const unwatch = wrapper.vm.$watch(
            () => wrapper.findComponent(NotFoundPage).exists(),
            (exists) => {
                if (exists) notFoundPageAppeared = true;
            },
        );

        // Wait for language dropdown to be available
        await waitForExpect(() => {
            expect(wrapper.find("[data-test='translationSelector']").exists()).toBe(true);
        });

        // Open the language dropdown (DropdownMenu trigger)
        const dropdownMenu = wrapper.findComponent(DropdownMenu);
        await dropdownMenu.find("[role='button']").trigger("click");
        await nextTick();

        // Click on French translation (options are in the dropdown panel)
        const options = wrapper.findAll("[role='menu'] button");
        expect(options.length).toBeGreaterThan(1);
        const frenchOption =
            options.find((o) => o.text().includes(mockLanguageDtoFra.name)) || options[1];
        await frenchOption.trigger("click");

        // Wait for French content to be shown
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
        });

        // Cleanup watcher
        unwatch();

        // Verify 404 page never appeared during the language switch
        expect(notFoundPageAppeared).toBe(false);
    });

    it("resolves content via a direct check on a cold mount with no local data yet, even if the socket never connects", async () => {
        // Setting a cutoff also makes HybridQuery's OWN internal below-cutoff
        // supplement (on this query and SingleContent's other content queries)
        // attempt background fetches — this test never calls initHybridQuery
        // with a mock HTTP service, so those attempts fail and log a caught
        // (harmless) error, on their own unrelated timing. Silence it for this
        // test only (restored in afterEach); SingleContent's own direct check
        // below is what this test actually exercises.
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        // Simulate a cold/incognito client: nothing cached locally, and a
        // below-cutoff-style sync window configured (matches a real
        // browser-tab session — app/src/main.ts sets a rolling cutoff there).
        // The socket deliberately never connects for the rest of this test —
        // resolveNotFound's own queryRemote check is a bare REST call, wired
        // independently of the socket handshake, so it must resolve content
        // correctly without ever needing `isConnected` to become true.
        config.contentPublishDateCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        isConnected.value = false;
        await db.docs.delete(mockEnglishContentDto._id);

        // The content genuinely exists — just not synced to this cold client yet.
        queryRemoteMock.mockImplementation(async (query: { selector?: { $and?: unknown[] } }) => {
            const clauses = query.selector?.$and ?? [];
            const isContentQuery = clauses.some(
                (c) => (c as Record<string, unknown>)?.type === DocType.Content,
            );
            return isContentQuery ? [mockEnglishContentDto] : [];
        });

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // Resolves to the real content — never a false 404 — even though the
        // socket never connects during this test.
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
        });
    });
});
