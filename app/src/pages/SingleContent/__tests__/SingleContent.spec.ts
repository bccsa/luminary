import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
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
import { appLanguageIdsAsRef, appName, initLanguage, userPreferencesAsRef } from "@/globalConfig";
import { ref, computed } from "vue";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import * as auth0 from "@auth0/auth0-vue";
import LImage from "@/components/images/LImage.vue";
import ImageModal from "@/components/images/ImageModal.vue";
import { useNotificationStore } from "@/stores/notification";

const routeReplaceMock = vi.hoisted(() => vi.fn());
const mockIsExternalNavigation = vi.hoisted(() => vi.fn());

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
                // Simulate a resolved href
                return { href: `/${name}${slug}` } as any;
            }),
            getRoutes: vi.fn().mockReturnValue([]),
        })),
    };
});

vi.mock("@/router", () => ({
    isExternalNavigation: () => mockIsExternalNavigation(),
    markInternalNavigation: vi.fn(),
}));

vi.mock("@auth0/auth0-vue");

// Mock video.js to prevent initialization errors
vi.mock("video.js", () => {
    const mockVideoPlayer = {
        poster: vi.fn(),
        src: vi.fn(),
        mobileUi: vi.fn(),
        on: vi.fn(),
        userActive: vi.fn(),
        requestFullscreen: vi.fn(),
        isFullscreen: vi.fn(() => false),
        pause: vi.fn(),
        play: vi.fn(),
        dispose: vi.fn(),
        off: vi.fn(),
        currentTime: vi.fn(),
        duration: vi.fn(),
        audioTracks: vi.fn(() => []), // Mock audioTracks method
    };

    const defaultFunction = () => mockVideoPlayer;
    defaultFunction.browser = {
        IS_SAFARI: false,
    };

    return {
        default: defaultFunction,
    };
});

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({
        bucketBaseUrl: computed(() => "https://bucket.example.com"),
    }),
}));

describe("SingleContent", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        // Ensure router mock is clean for each test
        routeReplaceMock.mockClear();

        // By default, mock as internal navigation (not external)
        mockIsExternalNavigation.mockReturnValue(false);

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

        // Reset notification store spy
        vi.clearAllMocks();

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

    // Remove all 404-related tests from here - they've been moved to SingleContent.404.spec.ts

    it("can zoom the image when clicking on the image", async () => {
        // Create mock content without hlsUrl so the image div renders instead of video player
        const mockContentWithoutVideo = {
            ...mockEnglishContentDto,
            parentMedia: {
                fileCollections: [],
            },
        };

        // Update the database with modified content
        await db.docs.update(mockContentWithoutVideo._id, mockContentWithoutVideo);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockContentWithoutVideo.slug,
            },
        });

        // First, wait for content to load and image to appear
        await waitForExpect(async () => {
            const image = wrapper.findComponent(LImage);
            expect(image.exists()).toBe(true);

            // click on the LImage
            await image.trigger("click");

            // Wait for the modal to appear
            await waitForExpect(() => {
                expect(wrapper.findComponent(ImageModal).exists()).toBe(true);
                expect(wrapper.findComponent(ImageModal).props("imageCollections")).toEqual(
                    mockContentWithoutVideo.parentImageData?.fileCollections,
                );
                expect(wrapper.findComponent(ImageModal).props("aspectRatio")).toBe("original");
                expect(wrapper.findComponent(ImageModal).props("size")).toBe("post");
            });
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

        // Wait until initial content is rendered
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });

        // Open the language dropdown
        const translationSelector = wrapper.find("[data-test='translationSelector']");
        await translationSelector.trigger("click");

        // Wait for options to render (must have at least 2)
        await waitForExpect(() => {
            expect(wrapper.findAll("[data-test='translationOption']").length).toBeGreaterThan(1);
        });

        // Choose the French option explicitly if present, otherwise pick the second option
        const options = wrapper.findAll("[data-test='translationOption']");
        const frenchOption =
            options.find((o) => o.text().includes(mockLanguageDtoFra.name)) || options[1];

        await frenchOption.trigger("click");

        // Expect French content to be shown
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });
    });

    it("shows the notification when the content is available in the preferred language", async () => {
        await initLanguage();

        // Clear any language switch flag from previous tests
        const { consumeLanguageSwitchFlag } = await import("@/util/isLangSwitch");
        consumeLanguageSwitchFlag();

        appLanguageIdsAsRef.value = ["lang-eng", "lang-fra"];

        // Set the CMS languages so that the preferred language computation works
        const { cmsLanguages } = await import("@/globalConfig");
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];

        // Mock external navigation BEFORE mounting
        mockIsExternalNavigation.mockReturnValue(true);

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

    it("shows the notification when opening from external link", async () => {
        await initLanguage();

        const { consumeLanguageSwitchFlag } = await import("@/util/isLangSwitch");
        consumeLanguageSwitchFlag();

        appLanguageIdsAsRef.value = ["lang-eng", "lang-fra"];

        const { cmsLanguages } = await import("@/globalConfig");
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];

        // Mock external navigation (e.g., from Google)
        mockIsExternalNavigation.mockReturnValue(true);

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

    it("shows the notification when opening from direct link (URL paste/bookmark)", async () => {
        await initLanguage();

        const { consumeLanguageSwitchFlag } = await import("@/util/isLangSwitch");
        consumeLanguageSwitchFlag();

        appLanguageIdsAsRef.value = ["lang-eng", "lang-fra"];

        const { cmsLanguages } = await import("@/globalConfig");
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];

        // Mock external navigation (direct link/bookmark/URL paste)
        mockIsExternalNavigation.mockReturnValue(true);

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockFrenchContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });

        // Direct links are treated as external, so notification SHOULD show
        await waitForExpect(() => {
            expect(useNotificationStore().addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "content-available",
                }),
            );
        }, 3000);
    });
});
