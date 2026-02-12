import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, Suspense } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import {
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "@/tests/mockdata";
import { db, type ContentDto, DocType, PostType, PublishStatus, TagType } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import UnpinnedVideo from "./UnpinnedVideo.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Wraps the component in a Suspense boundary since UnpinnedVideo uses top-level await.
 */
function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { UnpinnedVideo },
        template: "<Suspense><UnpinnedVideo /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

/** An unpinned category content doc (the tag's content representation). */
const mockUnpinnedCategoryContent: ContentDto = {
    _id: "content-tag-cat1-eng",
    type: DocType.Content,
    parentId: "tag-cat1",
    parentType: DocType.Tag,
    parentTagType: TagType.Category,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "category-1",
    title: "Category 1",
    summary: "An unpinned category",
    publishDate: 1704114000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

/** A second unpinned category content doc. */
const mockUnpinnedCategoryContent2: ContentDto = {
    _id: "content-tag-cat2-eng",
    type: DocType.Content,
    parentId: "tag-cat2",
    parentType: DocType.Tag,
    parentTagType: TagType.Category,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "category-2",
    title: "Category 2",
    summary: "Another unpinned category",
    publishDate: 1704114000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

/** Video content belonging to unpinned category 1. */
const mockVideoContent1: ContentDto = {
    _id: "content-video1-eng",
    type: DocType.Content,
    parentId: "post-video1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-cat1"],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "video-1",
    title: "Video One",
    summary: "First video",
    video: "video-file-1.mp4",
    publishDate: 1704114000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

/** Video content belonging to unpinned category 2. */
const mockVideoContent2: ContentDto = {
    _id: "content-video2-eng",
    type: DocType.Content,
    parentId: "post-video2",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-cat2"],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "video-2",
    title: "Video Two",
    summary: "Second video",
    video: "video-file-2.mp4",
    publishDate: 1704000000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

describe("UnpinnedVideo", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    it("displays video content grouped under an unpinned category", async () => {
        await db.docs.bulkPut([mockUnpinnedCategoryContent, mockVideoContent1]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).toContain("Video One");
        });
    });

    it("displays multiple unpinned categories with their respective content", async () => {
        await db.docs.bulkPut([
            mockUnpinnedCategoryContent,
            mockUnpinnedCategoryContent2,
            mockVideoContent1,
            mockVideoContent2,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).toContain("Category 2");
            expect(wrapper.text()).toContain("Video Two");
        });
    });

    it("does not display pinned categories", async () => {
        const pinnedCategory: ContentDto = {
            ...mockUnpinnedCategoryContent,
            _id: "content-tag-pinnedCat-eng",
            parentId: "tag-pinnedCat",
            parentPinned: 1,
            title: "Pinned Category",
        };
        const videoForPinned: ContentDto = {
            ...mockVideoContent1,
            _id: "content-video-pinned-eng",
            parentTags: ["tag-pinnedCat"],
            title: "Pinned Video",
        };
        await db.docs.bulkPut([pinnedCategory, videoForPinned]);

        const wrapper = mountWithSuspense();

        // The video content is fetched (it has a video, not a page, not a category tag type),
        // but the pinned category should not appear as a category grouping
        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Pinned Category");
        });
    });

    it("does not display content without a video", async () => {
        const noVideoContent: ContentDto = {
            ...mockVideoContent1,
            _id: "content-novideo-eng",
            video: "",
            title: "No Video Content",
        };
        await db.docs.bulkPut([mockUnpinnedCategoryContent, noVideoContent]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("No Video Content");
        });
    });

    it("filters out content with parentPostType Page", async () => {
        const pageContent: ContentDto = {
            ...mockVideoContent1,
            _id: "content-page-eng",
            parentPostType: PostType.Page,
            title: "Page Content",
        };
        await db.docs.bulkPut([
            mockUnpinnedCategoryContent,
            mockVideoContent1,
            pageContent,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Page Content");
        });
    });

    it("filters out content with parentTagType Category", async () => {
        const categoryTagContent: ContentDto = {
            ...mockVideoContent1,
            _id: "content-cattag-eng",
            parentTagType: TagType.Category,
            title: "Category Tagged Content",
        };
        await db.docs.bulkPut([
            mockUnpinnedCategoryContent,
            mockVideoContent1,
            categoryTagContent,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Category Tagged Content");
        });
    });

    it("filters out content with a future publish date", async () => {
        const futureContent: ContentDto = {
            ...mockVideoContent1,
            _id: "content-future-eng",
            publishDate: Date.now() + 1_000_000_000,
            title: "Future Video",
        };
        await db.docs.bulkPut([
            mockUnpinnedCategoryContent,
            mockVideoContent1,
            futureContent,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Future Video");
        });
    });

    it("filters out expired content", async () => {
        const expiredContent: ContentDto = {
            ...mockVideoContent1,
            _id: "content-expired-eng",
            expiryDate: 1000,
            title: "Expired Video",
        };
        await db.docs.bulkPut([
            mockUnpinnedCategoryContent,
            mockVideoContent1,
            expiredContent,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Expired Video");
        });
    });

    it("renders nothing when there is no video content", async () => {
        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toBe("");
        });
    });

    it("only shows content in the user's preferred language", async () => {
        const englishVideo: ContentDto = {
            ...mockVideoContent1,
            availableTranslations: ["lang-eng", "lang-fra"],
        };
        const frenchVideo: ContentDto = {
            ...mockVideoContent1,
            _id: "content-video1-fra",
            language: "lang-fra",
            title: "Vidéo en français",
            availableTranslations: ["lang-eng", "lang-fra"],
        };
        await db.docs.bulkPut([
            mockUnpinnedCategoryContent,
            englishVideo,
            frenchVideo,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Vidéo en français");
        });
    });
});
