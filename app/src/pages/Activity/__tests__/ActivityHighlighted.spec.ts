import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { recordUserActivity } from "@/userActivity/store";
import ActivityHighlighted from "../ActivityHighlighted.vue";

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

describe("ActivityHighlighted", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        appLanguageIdsAsRef.value.unshift(mockLanguageDtoEng._id);

        await db.docs.bulkPut([mockEnglishContentDto]);
        await db.userActivity.clear();

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("displays the translation a highlight belongs to", async () => {
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [{ start: 0, end: 5, color: "yellow" as const, text: "first" }] },
        );

        const wrapper = mount(ActivityHighlighted);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("displays a message when nothing is highlighted", async () => {
        await db.userActivity.clear();
        const wrapper = mount(ActivityHighlighted);

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
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [{ start: 0, end: 5, color: "yellow" as const, text: "first" }] },
        );
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: french._id,
                parentId: french.parentId,
            },
            { ranges: [{ start: 0, end: 5, color: "yellow" as const, text: "first" }] },
        );

        const wrapper = mount(ActivityHighlighted);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).toContain(french.title);
        });
    });

    it("shows one card per passage, narrowed by the colour", async () => {
        const ranges = [
            { start: 0, end: 5, color: "yellow" as const, text: "first" },
            { start: 10, end: 16, color: "green" as const, text: "second" },
        ];
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges },
        );
        const wrapper = mount(ActivityHighlighted);

        await waitForExpect(() => {
            expect(wrapper.findAll("[data-test=activity-excerpt]")).toHaveLength(2);
        });

        await wrapper.setProps({ colour: "green" });
        const shown = wrapper.findAll("[data-test=activity-excerpt]");
        expect(shown).toHaveLength(1);
        expect(shown[0].text()).toBe("second");
    });
});
