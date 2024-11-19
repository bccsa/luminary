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
    mockLanguageDtoSwa,
    mockTopicContentDto,
    mockTopicDto,
    mockRedirectDto,
} from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdAsRef, appName, initLanguage, userPreferencesAsRef } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "./NotFoundPage.vue";
import { ref } from "vue";
import RelatedContent from "../components/content/RelatedContent.vue";
import { BookmarkIcon as BookmarkIconSolid } from "@heroicons/vue/24/solid";
import { BookmarkIcon as BookmarkIconOutline } from "@heroicons/vue/24/outline";

const routeReplaceMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: ref({ params: { slug: mockEnglishContentDto.slug } }),
            replace: routeReplaceMock,
            back: vi.fn(),
        })),
    };
});

describe("SingleContent", () => {
    beforeEach(() => {
        appLanguageIdAsRef.value = mockLanguageDtoEng._id;

        db.docs.bulkPut([
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

        userPreferencesAsRef.value = { bookmarks: {} };
    });

    afterEach(() => {
        db.docs.clear();
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

    it("displays the content video when defined", async () => {
        await db.docs.update(mockEnglishContentDto._id, {
            parentImage: "",
            video: "test-video.mp4",
        });

        const wrapper = shallowMount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("video-player-stub");
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

    it("displays related content based on parentTags", async () => {
        await db.docs.update(mockEnglishContentDto._id, {
            parentTags: ["tag-category1", "tag-topicA"],
        });

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });
        await waitForExpect(() => {
            expect(wrapper.findComponent(RelatedContent).exists()).toBe(true);
            expect(wrapper.findComponent(RelatedContent).props("tags")).toEqual([mockTopicDto]);
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
        });

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
        });

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
        });

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

    it("switches correctly the content when the language changes", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.summary);
        });

        // Simulate language change
        appLanguageIdAsRef.value = mockLanguageDtoFra._id;
        initLanguage();

        const notificationStore = useNotificationStore();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.summary);
            expect(notificationStore.addNotification).not.toHaveBeenCalled();
        });
    });

    it("shows a notification when the language is not available", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // simulate language change
        appLanguageIdAsRef.value = mockLanguageDtoSwa._id;

        const notificationStore = useNotificationStore();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.summary);
            expect(notificationStore.addNotification).toHaveBeenCalled();
        });
    });

    it("sets the meta data correctly", async () => {
        mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        const metaDescription = document.head.querySelector("meta[name='description']");

        expect(document.title).toBe(`${mockEnglishContentDto.seoTitle} - ${appName}`);
        expect(metaDescription?.getAttribute("content")).toBe(mockEnglishContentDto.seoString);
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

    it("can bookmark a content", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(async () => {
            const bookmarkIcon = wrapper.findComponent(BookmarkIconOutline);
            bookmarkIcon.trigger("click");

            // We need to find a way to check if the content has been bookmarked in the localStorage
            const bookmarkIconSolid = wrapper.findComponent(BookmarkIconSolid);
            expect(bookmarkIconSolid.exists()).toBe(true);
        });
    });
});
