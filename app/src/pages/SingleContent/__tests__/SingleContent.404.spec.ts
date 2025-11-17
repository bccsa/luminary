import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SingleContent from "../SingleContent.vue";
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
import { db, type ContentDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import NotFoundPage from "../../NotFoundPage.vue";
import { ref } from "vue";
import * as auth0 from "@auth0/auth0-vue";

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
vi.mock("@auth0/auth0-vue");

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("SingleContent 404 Page", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        routeReplaceMock.mockClear();

        appLanguageIdsAsRef.value = [...appLanguageIdsAsRef.value, "lang-eng"];

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

        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });
    });

    afterEach(async () => {
        await db.docs.clear();
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

        // Track if 404 page appears at any point during language switch
        let notFoundPageAppeared = false;
        const unwatch = wrapper.vm.$watch(
            () => wrapper.findComponent(NotFoundPage).exists(),
            (exists) => {
                if (exists) notFoundPageAppeared = true;
            },
        );

        // Open the language dropdown
        const translationSelector = wrapper.find("[data-test='translationSelector']");
        await translationSelector.trigger("click");

        // Wait for options to render
        await waitForExpect(() => {
            expect(wrapper.findAll("[data-test='translationOption']").length).toBeGreaterThan(1);
        });

        // Click on French translation
        const options = wrapper.findAll("[data-test='translationOption']");
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
});
