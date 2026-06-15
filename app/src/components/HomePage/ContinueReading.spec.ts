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
import { db, type ContentDto, DocType, PostType, TagType } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef, setReadingProgress } from "@/globalConfig";
import ContinueReading from "./ContinueReading.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("ContinueReading", () => {
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

    it("displays in-progress articles that are published", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);
        setReadingProgress(mockEnglishContentDto._id, 42);

        const wrapper = mount(ContinueReading);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).toContain("home.continue.read");
        });
    });

    it("does not render when there is no reading progress", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mount(ContinueReading);

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(mockEnglishContentDto.title);
        });
    });

    it("filters out content with parentPostType Page", async () => {
        const pageContent: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-page1-eng",
            parentPostType: PostType.Page,
            slug: "page1-eng",
        };
        await db.docs.bulkPut([pageContent]);
        setReadingProgress(pageContent._id, 50);

        const wrapper = mount(ContinueReading);

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(pageContent.title);
        });
    });

    it("filters out category tag content", async () => {
        await db.docs.bulkPut([mockCategoryContentDto]);
        setReadingProgress(mockCategoryContentDto._id, 50);

        const wrapper = mount(ContinueReading);

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(mockCategoryContentDto.title);
        });
    });
});
