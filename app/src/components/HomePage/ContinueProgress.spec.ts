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
import {
    setMediaProgress,
    setReadingProgress,
    syncContentProgressFromStorage,
} from "@/contentProgress";
import ContinueProgress from "./ContinueProgress.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

function setProgress(contentIds: string[]) {
    [...contentIds].reverse().forEach((contentId, index) => {
        setReadingProgress(contentId, 40 + index);
    });
}

describe("ContinueProgress", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        localStorage.clear();
        syncContentProgressFromStorage();

        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
        localStorage.clear();
    });

    it("displays content with only video progress", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);
        setMediaProgress(`media-${mockEnglishContentDto._id}`, mockEnglishContentDto._id, 60, 300);

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("displays content with reading progress that is published", async () => {
        const textContent: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-read-eng",
            title: "Reading Article",
            video: undefined,
            text: "<p>Hello world</p>",
        };
        await db.docs.bulkPut([textContent]);
        setReadingProgress(textContent._id, 42);

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Reading Article");
        });
    });

    it("does not render when there is no content progress", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mount(ContinueProgress);

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
        setProgress([mockEnglishContentDto._id, pageContent._id]);

        const wrapper = mount(ContinueProgress);

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
        setProgress([mockEnglishContentDto._id, categoryContent._id]);

        const wrapper = mount(ContinueProgress);

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
        setProgress([mockEnglishContentDto._id, futureContent._id]);

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Future Content");
        });
    });

    it("filters out expired content", async () => {
        const expiredContent: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-expired-eng",
            expiryDate: 1000,
            title: "Expired Content",
        };
        await db.docs.bulkPut([mockEnglishContentDto, expiredContent]);
        setProgress([mockEnglishContentDto._id, expiredContent._id]);

        const wrapper = mount(ContinueProgress);

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
        setProgress([mockEnglishContentDto._id, nonContent._id]);

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).not.toContain("Not a Content Doc");
        });
    });

    it("handles missing documents gracefully (IDs not in database)", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);
        setProgress([mockEnglishContentDto._id, "nonexistent-id"]);

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("handles invalid JSON in localStorage gracefully", async () => {
        localStorage.setItem("contentProgress", "not-valid-json");
        syncContentProgressFromStorage();

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.html()).toBeDefined();
        });
    });

    it("cleans up storage listeners on unmount", () => {
        const removeEventSpy = vi.spyOn(window, "removeEventListener");

        const wrapper = mount(ContinueProgress);
        wrapper.unmount();

        expect(removeEventSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    });

    it("preserves progress order regardless of database order", async () => {
        const contentA: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-aaa",
            title: "Alpha Content",
            slug: "alpha-content",
        };
        const contentB: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-bbb",
            title: "Bravo Content",
            slug: "bravo-content",
        };
        const contentC: ContentDto = {
            ...mockEnglishContentDto,
            _id: "content-ccc",
            title: "Charlie Content",
            slug: "charlie-content",
        };

        await db.docs.bulkPut([contentA, contentB, contentC]);
        setProgress([contentC._id, contentB._id, contentA._id]);

        const wrapper = mount(ContinueProgress);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Alpha Content");
            expect(wrapper.text()).toContain("Bravo Content");
            expect(wrapper.text()).toContain("Charlie Content");
        });

        const html = wrapper.html();
        const posC = html.indexOf("Charlie Content");
        const posB = html.indexOf("Bravo Content");
        const posA = html.indexOf("Alpha Content");

        expect(posC).toBeLessThan(posB);
        expect(posB).toBeLessThan(posA);
    });
});
