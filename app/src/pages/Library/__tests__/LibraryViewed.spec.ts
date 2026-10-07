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
import { getUserActivity, recordUserActivity } from "@/userActivity/store";
import LibraryViewed from "../LibraryViewed.vue";

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

describe("LibraryViewed", () => {
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

    it("displays viewed content", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });

        const wrapper = mount(LibraryViewed);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("displays a message when nothing was viewed", async () => {
        await userActivityDb.userActivity.clear();
        const wrapper = mount(LibraryViewed);

        expect(wrapper.text()).toContain("Posts you read or watch will show up here.");
    });

    it("removes an entry straight away", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });
        const wrapper = mount(LibraryViewed);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-remove-viewed]").exists()).toBe(true);
        });
        await wrapper.find("[data-test=library-remove-viewed]").trigger("click");

        await waitForExpect(async () => {
            expect(await getUserActivity("viewed")).toEqual([]);
        });
    });
});
