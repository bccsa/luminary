import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockCategoryContentDto,
} from "@/tests/mockdata";
import { db, type ContentDto, DocType, TagType, PostType, PublishStatus } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import HomePagePinned from "./HomePagePinned.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Wraps the component in a Suspense boundary since HomePagePinned uses top-level await.
 */
function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { HomePagePinned },
        template: "<Suspense><HomePagePinned /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

/**
 * Helper: create a pinned category content doc.
 * This represents the Content document for a pinned category tag.
 */
function makePinnedCategoryContent(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        _id: "content-pinned-cat1",
        type: DocType.Content,
        parentId: "tag-pinned-cat1",
        parentType: DocType.Tag,
        parentTagType: TagType.Category,
        parentPinned: 1,
        updatedTimeUtc: 1704114000000,
        memberOf: [],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "pinned-cat1",
        title: "Pinned Category",
        summary: "A pinned category",
        publishDate: Date.now() - 100_000,
        availableTranslations: ["lang-eng"],
        ...overrides,
    } as ContentDto;
}

/**
 * Helper: create a content doc that belongs to a pinned category.
 */
function makePinnedCategoryChild(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        ...mockEnglishContentDto,
        _id: "content-child1-eng",
        parentId: "post-child1",
        parentTags: ["tag-pinned-cat1"],
        parentTagType: TagType.Topic,
        title: "Child Content 1",
        publishDate: Date.now() - 100_000,
        availableTranslations: ["lang-eng"],
        ...overrides,
    };
}

describe("HomePagePinned", () => {
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

    it("displays content grouped under a pinned category", async () => {
        const pinnedCat = makePinnedCategoryContent();
        const child = makePinnedCategoryChild();

        await db.docs.bulkPut([pinnedCat, child]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            // The pinned category title should be rendered as a section title
            expect(wrapper.text()).toContain("Pinned Category");
            // The child content should appear
            expect(wrapper.text()).toContain("Child Content 1");
        });
    });

    it("does not render when there are no pinned categories", async () => {
        // Only add regular (non-pinned) content
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mountWithSuspense();

        // Component should not render any HorizontalContentTileCollection
        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(mockEnglishContentDto.title);
        });
    });

    it("filters out child content with parentPostType Page", async () => {
        const pinnedCat = makePinnedCategoryContent();
        const regularChild = makePinnedCategoryChild();
        const pageChild: ContentDto = {
            ...makePinnedCategoryChild(),
            _id: "content-page-child-eng",
            parentId: "post-page-child",
            parentPostType: PostType.Page,
            title: "Page Child Content",
        };

        await db.docs.bulkPut([pinnedCat, regularChild, pageChild]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Child Content 1");
            expect(wrapper.text()).not.toContain("Page Child Content");
        });
    });

    it("filters out child content with a future publish date", async () => {
        const pinnedCat = makePinnedCategoryContent();
        const regularChild = makePinnedCategoryChild();
        const futureChild: ContentDto = {
            ...makePinnedCategoryChild(),
            _id: "content-future-child-eng",
            parentId: "post-future-child",
            publishDate: Date.now() + 1_000_000_000,
            title: "Future Child Content",
        };

        await db.docs.bulkPut([pinnedCat, regularChild, futureChild]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Child Content 1");
            expect(wrapper.text()).not.toContain("Future Child Content");
        });
    });

    it("filters out expired child content", async () => {
        const pinnedCat = makePinnedCategoryContent();
        const regularChild = makePinnedCategoryChild();
        const expiredChild: ContentDto = {
            ...makePinnedCategoryChild(),
            _id: "content-expired-child-eng",
            parentId: "post-expired-child",
            expiryDate: 1000, // far in the past
            title: "Expired Child Content",
        };

        await db.docs.bulkPut([pinnedCat, regularChild, expiredChild]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Child Content 1");
            expect(wrapper.text()).not.toContain("Expired Child Content");
        });
    });

    it("filters out pinned categories that are not published (future publish date)", async () => {
        const futurePinnedCat = makePinnedCategoryContent({
            _id: "content-future-pinned-cat",
            parentId: "tag-future-pinned-cat",
            publishDate: Date.now() + 1_000_000_000,
            title: "Future Pinned Category",
        });
        const child: ContentDto = {
            ...makePinnedCategoryChild(),
            parentTags: ["tag-future-pinned-cat"],
            title: "Child of Future Category",
        };

        await db.docs.bulkPut([futurePinnedCat, child]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Future Pinned Category");
            expect(wrapper.text()).not.toContain("Child of Future Category");
        });
    });

    it("displays multiple pinned categories", async () => {
        const pinnedCat1 = makePinnedCategoryContent();
        const pinnedCat2 = makePinnedCategoryContent({
            _id: "content-pinned-cat2",
            parentId: "tag-pinned-cat2",
            title: "Second Pinned Category",
        });
        const child1 = makePinnedCategoryChild();
        const child2 = makePinnedCategoryChild({
            _id: "content-child2-eng",
            parentId: "post-child2",
            parentTags: ["tag-pinned-cat2"],
            title: "Child Content 2",
        });

        await db.docs.bulkPut([pinnedCat1, pinnedCat2, child1, child2]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Pinned Category");
            expect(wrapper.text()).toContain("Second Pinned Category");
            expect(wrapper.text()).toContain("Child Content 1");
            expect(wrapper.text()).toContain("Child Content 2");
        });
    });

    it("only shows content in the user's preferred language", async () => {
        const pinnedCat = makePinnedCategoryContent();
        const engChild = makePinnedCategoryChild();
        // Both translations exist for the same parent – the system should pick
        // English and skip French because English has higher priority.
        const fraChild: ContentDto = {
            ...makePinnedCategoryChild(),
            _id: "content-child1-fra",
            language: "lang-fra",
            title: "French Child Content",
            availableTranslations: ["lang-eng", "lang-fra"],
        };

        await db.docs.bulkPut([pinnedCat, engChild, fraChild]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Child Content 1");
            expect(wrapper.text()).not.toContain("French Child Content");
        });
    });
});
