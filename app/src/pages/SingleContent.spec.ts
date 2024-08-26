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
} from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdAsRef, initLanguage } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "./NotFoundPage.vue";

const routeReplaceMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            replace: routeReplaceMock,
        })),
    };
});

describe("SingleContent", () => {
    beforeEach(() => {
        db.docs.bulkPut([
            mockPostDto,
            mockCategoryDto,
            mockCategoryContentDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);

        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        db.docs.clear();
    });

    it("displays the loading spinner when no content is available", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
    });

    it("displays the content image", async () => {
        await db.docs.update(mockEnglishContentDto._id, { image: "test-image.jpg" });

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("test-image.jpg");
        });
    });

    it("displays the content video when defined", async () => {
        await db.docs.update(mockEnglishContentDto._id, {
            image: "",
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

    it("displays the pusblish date content", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Jan 1, 2024");
        });
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

    it("displays tags", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Category 1");
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

    it("does not display scheduled or expired content", async () => {
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

    it("switches correctly the content when the language changes", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.summary);
        });

        // simulate language change
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
});
