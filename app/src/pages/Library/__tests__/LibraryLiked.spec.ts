import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef, userPreferencesAsRef } from "@/globalConfig";
import LibraryLiked from "../LibraryLiked.vue";

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

describe("LibraryLiked", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        appLanguageIdsAsRef.value.unshift(mockLanguageDtoEng._id);

        await db.docs.bulkPut([mockEnglishContentDto]);

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("displays liked content", async () => {
        userPreferencesAsRef.value.bookmarks = [
            { id: mockEnglishContentDto.parentId, ts: Date.now() },
        ];

        const wrapper = mount(LibraryLiked);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("displays a message when nothing is liked", async () => {
        userPreferencesAsRef.value.bookmarks = [];
        const wrapper = mount(LibraryLiked);

        expect(wrapper.text()).toContain("Posts you like will show up here.");
    });
});
