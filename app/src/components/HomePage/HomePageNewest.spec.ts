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
import { db, type ContentDto, DocType, PostType, TagType } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import HomePageNewest from "./HomePageNewest.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Wraps the component in a Suspense boundary since HomePageNewest uses top-level await.
 */
function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { HomePageNewest },
        template: "<Suspense><HomePageNewest /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

describe("HomePageNewest", () => {
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

    it("displays published content", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("renders the 'Newest' title", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Newest");
        });
    });

    it("filters out content with parentPostType Page", async () => {
        const pageContent: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-page1-eng",
            parentPostType: PostType.Page,
            title: "Page Content",
        };
        await db.docs.bulkPut([mockEnglishContentDto, pageContent]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Page Content");
        });
    });

    it("filters out content with parentTagType Category", async () => {
        const categoryContent: ContentDto = {
            ...mockCategoryContentDto,
            title: "Category Content",
        };
        await db.docs.bulkPut([mockEnglishContentDto, categoryContent]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Category Content");
        });
    });

    it("filters out content with a future publish date", async () => {
        const futureContent: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-future-eng",
            publishDate: Date.now() + 1_000_000_000,
            title: "Future Content",
        };
        await db.docs.bulkPut([mockEnglishContentDto, futureContent]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Future Content");
        });
    });

    it("filters out expired content", async () => {
        const expiredContent: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-expired-eng",
            expiryDate: 1000, // far in the past
            title: "Expired Content",
        };
        await db.docs.bulkPut([mockEnglishContentDto, expiredContent]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Expired Content");
        });
    });

    it("filters out non-Content documents", async () => {
        const nonContent = {
            ...mockEnglishContentDto,
            _id: "tag-doc",
            type: DocType.Tag,
            title: "Not a Content Doc",
        };
        await db.docs.bulkPut([mockEnglishContentDto, nonContent as any]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Not a Content Doc");
        });
    });

    it("limits results to 10 items", async () => {
        const docs: ContentDto[] = [];
        for (let i = 0; i < 15; i++) {
            docs.push({
                ...mockEnglishContentDto,
                _id: `content-post${i}-eng`,
                parentId: `post-post${i}`,
                title: `Post ${i}`,
                publishDate: 1704114000000 - i * 100000,
                availableTranslations: ["lang-eng"],
            });
        }
        await db.docs.bulkPut(docs);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            // Should show the first 10 (newest by publishDate)
            for (let i = 0; i < 10; i++) {
                expect(wrapper.text()).toContain(`Post ${i}`);
            }
            // Should not show the remaining 5
            for (let i = 10; i < 15; i++) {
                expect(wrapper.text()).not.toContain(`Post ${i}`);
            }
        });
    });

    it("orders content by publishDate descending (newest first)", async () => {
        const older: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-older-eng",
            parentId: "post-older",
            title: "Older Post",
            publishDate: 1600000000000,
            availableTranslations: ["lang-eng"],
        };
        const newer: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-newer-eng",
            parentId: "post-newer",
            title: "Newer Post",
            publishDate: 1704114000000,
            availableTranslations: ["lang-eng"],
        };
        await db.docs.bulkPut([older, newer]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            const text = wrapper.text();
            const newerIndex = text.indexOf("Newer Post");
            const olderIndex = text.indexOf("Older Post");
            expect(newerIndex).toBeGreaterThan(-1);
            expect(olderIndex).toBeGreaterThan(-1);
            // Newer should appear before older
            expect(newerIndex).toBeLessThan(olderIndex);
        });
    });

    it("only shows content in the user's preferred language", async () => {
        // Both translations exist for the same parent – the system should pick
        // English and skip French because English has higher priority.
        const frenchTranslation: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-post1-fra",
            language: "lang-fra",
            title: "French Translation",
            availableTranslations: ["lang-eng", "lang-fra"],
        };
        await db.docs.bulkPut([mockEnglishContentDto, frenchTranslation]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("French Translation");
        });
    });
});
