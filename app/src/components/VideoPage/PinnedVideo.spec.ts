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
import PinnedVideo from "./PinnedVideo.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Wraps the component in a Suspense boundary since PinnedVideo uses top-level await.
 */
function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { PinnedVideo },
        template: "<Suspense><PinnedVideo /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

/** A pinned category content doc (the tag's content representation). */
const mockPinnedCategoryContent: ContentDto = {
    _id: "content-tag-pinnedCat1-eng",
    type: DocType.Content,
    parentId: "tag-pinnedCat1",
    parentType: DocType.Tag,
    parentTagType: TagType.Category,
    parentPinned: 1,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "pinned-category-1",
    title: "Pinned Category 1",
    summary: "A pinned category",
    publishDate: 1704114000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

/** A second pinned category content doc. */
const mockPinnedCategoryContent2: ContentDto = {
    _id: "content-tag-pinnedCat2-eng",
    type: DocType.Content,
    parentId: "tag-pinnedCat2",
    parentType: DocType.Tag,
    parentTagType: TagType.Category,
    parentPinned: 1,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "pinned-category-2",
    title: "Pinned Category 2",
    summary: "Another pinned category",
    publishDate: 1704114000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

/** Video content belonging to pinned category 1. */
const mockVideoContent1: ContentDto = {
    _id: "content-video1-eng",
    type: DocType.Content,
    parentId: "post-video1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-pinnedCat1"],
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

/** Video content belonging to pinned category 2. */
const mockVideoContent2: ContentDto = {
    _id: "content-video2-eng",
    type: DocType.Content,
    parentId: "post-video2",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-pinnedCat2"],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "video-2",
    title: "Video Two",
    summary: "Second video",
    video: "video-file-2.mp4",
    publishDate: 1704114000000,
    parentImageData: {
        fileCollections: [
            { aspectRatio: 1.5, imageFiles: [{ width: 180, height: 120, filename: "test.webp" }] },
        ],
    },
    availableTranslations: ["lang-eng"],
};

describe("PinnedVideo", () => {
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

    it("displays video content grouped under a pinned category", async () => {
        await db.docs.bulkPut([mockPinnedCategoryContent, mockVideoContent1]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Pinned Category 1");
            expect(wrapper.text()).toContain("Video One");
        });
    });

    it("displays multiple pinned categories with their respective content", async () => {
        await db.docs.bulkPut([
            mockPinnedCategoryContent,
            mockPinnedCategoryContent2,
            mockVideoContent1,
            mockVideoContent2,
        ]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Pinned Category 1");
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).toContain("Pinned Category 2");
            expect(wrapper.text()).toContain("Video Two");
        });
    });

    it("does not display unpinned categories", async () => {
        const unpinnedCategory: ContentDto = {
            ...mockPinnedCategoryContent,
            _id: "content-tag-unpinnedCat-eng",
            parentId: "tag-unpinnedCat",
            parentPinned: 0,
            title: "Unpinned Category",
        };
        const videoForUnpinned: ContentDto = {
            ...mockVideoContent1,
            _id: "content-video-unpinned-eng",
            parentTags: ["tag-unpinnedCat"],
            title: "Unpinned Video",
        };
        await db.docs.bulkPut([unpinnedCategory, videoForUnpinned]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Unpinned Category");
            expect(wrapper.text()).not.toContain("Unpinned Video");
        });
    });

    it("does not display content without a video", async () => {
        const noVideoContent: ContentDto = {
            ...mockVideoContent1,
            _id: "content-novideo-eng",
            video: "",
            title: "No Video Content",
        };
        await db.docs.bulkPut([mockPinnedCategoryContent, noVideoContent]);

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
        await db.docs.bulkPut([mockPinnedCategoryContent, mockVideoContent1, pageContent]);

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
        await db.docs.bulkPut([mockPinnedCategoryContent, mockVideoContent1, categoryTagContent]);

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
        await db.docs.bulkPut([mockPinnedCategoryContent, mockVideoContent1, futureContent]);

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
        await db.docs.bulkPut([mockPinnedCategoryContent, mockVideoContent1, expiredContent]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Expired Video");
        });
    });

    it("renders nothing when there are no pinned categories", async () => {
        // Only add a video content doc, but no pinned category
        await db.docs.bulkPut([mockVideoContent1]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Video One");
        });
    });

    it("renders nothing when pinned categories have no matching video content", async () => {
        // Pinned category exists but no video content references it
        const videoForOtherTag: ContentDto = {
            ...mockVideoContent1,
            parentTags: ["tag-other"],
            title: "Other Tag Video",
        };
        await db.docs.bulkPut([mockPinnedCategoryContent, videoForOtherTag]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Pinned Category 1");
            expect(wrapper.text()).not.toContain("Other Tag Video");
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
        await db.docs.bulkPut([mockPinnedCategoryContent, englishVideo, frenchVideo]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Video One");
            expect(wrapper.text()).not.toContain("Vidéo en français");
        });
    });
});
