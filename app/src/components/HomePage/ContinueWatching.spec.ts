import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockCategoryContentDto,
} from "@/tests/mockdata";
import { db, type ContentDto, DocType, PostType } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import ContinueWatching from "./ContinueWatching.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Helper: set localStorage "mediaProgress" to a list of watched content IDs.
 */
function setMediaProgress(contentIds: string[]) {
    const entries = contentIds.map((contentId) => ({
        mediaId: `media-${contentId}`,
        contentId,
    }));
    localStorage.setItem("mediaProgress", JSON.stringify(entries));
}

describe("ContinueWatching", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        localStorage.clear();

        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
        localStorage.clear();
    });

    it("displays watched content that is published", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);
        setMediaProgress([mockEnglishContentDto._id]);

        const wrapper = mount(ContinueWatching);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("does not render when there is no media progress", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);
        // No media progress set in localStorage

        const wrapper = mount(ContinueWatching);

        // The component should not render the collection (v-if="watchedContent.length > 0")
        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(mockEnglishContentDto.title);
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
        setMediaProgress([mockEnglishContentDto._id, pageContent._id]);

        const wrapper = mount(ContinueWatching);

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
        setMediaProgress([mockEnglishContentDto._id, categoryContent._id]);

        const wrapper = mount(ContinueWatching);

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
        setMediaProgress([mockEnglishContentDto._id, futureContent._id]);

        const wrapper = mount(ContinueWatching);

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
        setMediaProgress([mockEnglishContentDto._id, expiredContent._id]);

        const wrapper = mount(ContinueWatching);

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
        setMediaProgress([mockEnglishContentDto._id, nonContent._id]);

        const wrapper = mount(ContinueWatching);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Not a Content Doc");
        });
    });

    it("handles missing documents gracefully (IDs not in database)", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);
        setMediaProgress([mockEnglishContentDto._id, "nonexistent-id"]);

        const wrapper = mount(ContinueWatching);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });
});
