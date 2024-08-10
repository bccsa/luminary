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
} from "@/tests/mockdata";
import { db, type BaseDocumentDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import NotFoundPage from "./NotFoundPage.vue";

const routePushMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRoute: vi.fn().mockImplementation(() => ({
            push: routePushMock,
        })),
    };
});
import { appLanguageAsRef } from "@/globalConfig";
import { ref } from "vue";

const routeReplaceMock = vi.fn();
vi.mock("vue-router", () => {
    return {
        useRouter: () => ({
            replace: routeReplaceMock,
        }),
    };
});

describe("SingleContent", () => {
    const mockAppLanguageAsRef = ref(mockLanguageDtoEng);

    beforeEach(() => {
        db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            mockCategoryContentDto,
            mockFrenchContentDto,

            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ] as BaseDocumentDto[]);

        setActivePinia(createTestingPinia());

        vi.spyOn(appLanguageAsRef, "value", "get").mockReturnValue(mockAppLanguageAsRef.value);
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
            expect(wrapper.html()).not.toContain("Tags");
        });
    });

    it("switches correctly the content when the language changes", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // Wait for the initial content to load
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockEnglishContentDto.summary);
        });

        // Simulate language change to French
        mockAppLanguageAsRef.value = mockLanguageDtoFra;
        await wrapper.vm.$nextTick();

        // Assert: Check if the content updates
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockFrenchContentDto.summary);
        });

        expect(routeReplaceMock).toHaveBeenCalledWith({
            name: "content",
            params: { slug: mockFrenchContentDto.slug },
        });
    });
});
