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
import LImage from "@/components/images/LImage.vue";
import ImageModal from "@/components/images/ImageModal.vue";
import { useNotificationStore } from "@/stores/notification";

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
    // TODO: Add test to check if the notification is shown when the content is available in the preferred language

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

    it("can zoom the image when clicking on the image", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            const image = wrapper.findComponent(LImage);
            expect(image.exists()).toBe(true);

            image.trigger("click");

            // expect ImageModal to be opened
            expect(wrapper.findComponent(ImageModal).exists()).toBe(true);

            // expect ImageModal to have the correct image source and correct props
            const imageModal = wrapper.findComponent(ImageModal);
            console.log(imageModal.props());
            expect(imageModal.props("imageCollections")).toEqual(
                mockEnglishContentDto.parentImageData?.fileCollections,
            );
            expect(imageModal.props("aspectRatio")).toBe("video");
            expect(imageModal.props("size")).toBe("post");
        });
    });

    it("shows the theme button", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // Wait until content is loaded (article is rendered)
        await waitForExpect(() => {
            expect(wrapper.find("article").exists()).toBe(true);
        });

        // Now the quick controls slot should be rendered
        const quickControls = wrapper.find('[data-test="themeButton"]');
        expect(quickControls.exists()).toBe(true);
    });

    it("switches the language of content when clicking on the language button", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });

        const translationSelector = wrapper.find("[data-test='translationSelector']");

        await translationSelector.trigger("click");

        await waitForExpect(async () => {
            await wrapper.findAll("[data-test='translationOption']")[1].trigger("click");

            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });
    });

    it("shows the notification when the content is available in the preferred language", async () => {
        await initLanguage();

        // Clear any language switch flag from previous tests
        // This ensures the notification will show when viewing non-preferred language content
        const { consumeLanguageSwitchFlag } = await import("@/util/isLangSwitch");
        consumeLanguageSwitchFlag(); // Reset the flag to false

        appLanguageIdsAsRef.value = ["lang-eng", "lang-fra"];

        // Set the CMS languages so that the preferred language computation works
        const { cmsLanguages } = await import("@/globalConfig");
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];

        // Navigate to French content (not the preferred language)
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockFrenchContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });

        await waitForExpect(() => {
            expect(useNotificationStore().addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "content-available",
                    title: "Translation available",
                    description: `The content is also available in English. Click here to view it.`,
                    state: "info",
                    type: "banner",
                }),
            );
        }, 3000);
    });
});
