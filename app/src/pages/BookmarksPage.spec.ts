import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdAsRef, userPreferencesAsRef } from "@/globalConfig";
import BookmarksPage from "./BookmarksPage.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("BookmarksPage", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        appLanguageIdAsRef.value = mockLanguageDtoEng._id;

        await db.docs.bulkPut([mockEnglishContentDto]);

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("displays bookmarked content", async () => {
        userPreferencesAsRef.value.bookmarks = [
            { id: mockEnglishContentDto.parentId, ts: Date.now() },
        ];

        const wrapper = mount(BookmarksPage);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("displays a message when there are no bookmarks", async () => {
        userPreferencesAsRef.value.bookmarks = [];
        const wrapper = mount(BookmarksPage);

        expect(wrapper.text()).toContain("You should try this");
    });
});
