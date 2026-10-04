import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { userActivityDb } from "@/userActivity/db";
import { recordUserActivity } from "@/userActivity/store";
import LibraryHighlighted from "../LibraryHighlighted.vue";

vi.mock("vue-router");
vi.mock("@/router", () => ({
    default: {},
    getRouteHistory: () => ({ value: [] }),
    markInternalNavigation: vi.fn(),
    isExternalNavigation: vi.fn(),
}));
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => (mockLanguageDtoEng.translations as Record<string, string>)[key] || key,
    }),
}));

describe("LibraryHighlighted", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        appLanguageIdsAsRef.value.unshift(mockLanguageDtoEng._id);

        await db.docs.bulkPut([mockEnglishContentDto]);
        await userActivityDb.userActivity.clear();

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("displays the translation a highlight belongs to", async () => {
        await recordUserActivity({
            type: "highlighted",
            contentId: mockEnglishContentDto._id,
            parentId: mockEnglishContentDto.parentId,
        });

        const wrapper = mount(LibraryHighlighted);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("displays a message when nothing is highlighted", async () => {
        await userActivityDb.userActivity.clear();
        const wrapper = mount(LibraryHighlighted);

        expect(wrapper.text()).toContain("Posts where you highlight text will show up here.");
    });

    it("shows one entry per highlighted translation of the same post", async () => {
        const french = {
            ...mockEnglishContentDto,
            _id: "content-post1-fra",
            language: "lang-fra",
            title: "Poste 1",
        };
        await db.docs.bulkPut([french]);
        await recordUserActivity({
            type: "highlighted",
            contentId: mockEnglishContentDto._id,
            parentId: mockEnglishContentDto.parentId,
        });
        await recordUserActivity({
            type: "highlighted",
            contentId: french._id,
            parentId: french.parentId,
        });

        const wrapper = mount(LibraryHighlighted);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).toContain(french.title);
        });
    });
});
