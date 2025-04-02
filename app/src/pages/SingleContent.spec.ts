import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SingleContent from "./SingleContent.vue";
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
import { appLanguageIdsAsRef, appName, initLanguage, userPreferencesAsRef } from "@/globalConfig";
import NotFoundPage from "./NotFoundPage.vue";
import { ref } from "vue";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
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
        })),
    };
});
vi.mock("@auth0/auth0-vue");

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("SingleContent", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

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

    it("displays the video player when defined", async () => {
        await db.docs.update(mockEnglishContentDto._id, {
            parentImage: "",
            video: "test-video.mp4",
        } as any);

        const wrapper = shallowMount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        const videoPlayer = wrapper.findComponent(VideoPlayer);

        await waitForExpect(() => {
            expect(videoPlayer).toBeDefined();
        });
    });

    it("displays the content image", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("test-image.webp");
        });
    });

    it("displays the publish date", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Jan 1, 2024");
        });
    });

    it("hides the publishDate if publishDateVisible is false", async () => {
        const mockContent = { ...mockEnglishContentDto, parentPublishDateVisible: false };
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockContent.slug,
            },
        });
        expect(wrapper.text()).not.toContain("Jan 1, 2024");
    });

    it("displays the summary content", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("This is an example post");
        });
    });

    it("displays the content text", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find("p").exists()).toBe(true);
        });
    });

    it("displays related content", async () => {
        await db.docs.bulkPut([
            { ...mockEnglishContentDto, parentTags: [mockTopicContentDto.parentId] } as ContentDto,
            {
                ...mockEnglishContentDto,
                _id: "content2",
                parentId: "post2",
                title: "content 2",
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
            {
                ...mockTopicContentDto,
                parentTaggedDocs: [mockEnglishContentDto.parentId, "post2"],
            } as ContentDto,
        ]);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockTopicContentDto.title);
            expect(wrapper.text()).toContain("content 2");
        });
    });

    it("doesn't display tag when content not tagged", async () => {
        const mockContent = { ...mockEnglishContentDto, tags: [] };
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockContent.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Tags");
        });
    });

    it("displays the 404 error when the content is scheduled", async () => {
        // Set a future publish date and an expired date
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
        // Set a future publish date and an expired date
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

    it("switches the content correctly when the language changes", async () => {
        await initLanguage();

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.summary);
        });

        await waitForExpect(() => {
            // Simulate language change
            appLanguageIdsAsRef.value.unshift(mockLanguageDtoFra._id);
            expect(routeReplaceMock).toBeCalledWith({
                name: "content",
                params: { slug: mockFrenchContentDto.slug },
            });
        });
    });

    it("sets the meta data correctly", async () => {
        mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            const metaDescription = document.head.querySelector("meta[name='description']");

            expect(document.title).toBe(`${mockEnglishContentDto.seoTitle} - ${appName}`);
            expect(metaDescription?.getAttribute("content")).toBe(mockEnglishContentDto.seoString);
        });
    });

    it("redirects correctly", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockRedirectDto.slug,
            },
        });

        await wrapper.vm.$nextTick();

        await waitForExpect(() => {
            expect(wrapper.vm.slug).toBe("vod");
            expect(routeReplaceMock).toBeCalledWith({
                name: "content",
                params: { slug: "page1-eng" },
            });
        });
    });

    it("redirects to homepage if no address to redirect to is given", async () => {
        const mockRedirect = {
            ...mockRedirectDto,
            slug: "music",
            toSlug: "test",
            _id: "redirect-1",
        };

        await db.docs.bulkPut([mockRedirect]);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockRedirect.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.vm.slug).toBe("music");
            expect(routeReplaceMock).toBeCalledWith({
                name: "content",
                params: { slug: "test" },
            });
        });
    });

    it("can add and remove a bookmark", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Loading...");
        });

        const icon = wrapper.find("div[data-test='bookmark']");
        expect(icon.exists()).toBe(true);
        icon.trigger("click");

        await waitForExpect(async () => {
            expect(
                userPreferencesAsRef.value.bookmarks &&
                    userPreferencesAsRef.value.bookmarks.some(
                        (b) => b.id === mockEnglishContentDto.parentId,
                    ),
            ).toBe(true);
        });

        icon.trigger("click");

        await waitForExpect(async () => {
            expect(
                userPreferencesAsRef.value.bookmarks &&
                    userPreferencesAsRef.value.bookmarks.some(
                        (b) => b.id === mockEnglishContentDto.parentId,
                    ),
            ).toBe(false);
        });
    });

    it("displays the author", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.author);
        });

        const mockContent = { ...mockEnglishContentDto, author: "" };
        await db.docs.update(mockContent._id, mockContent);

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(mockEnglishContentDto.author);
        });
    });
});
