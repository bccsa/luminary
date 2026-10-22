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
        await recordUserActivity({
            type: "highlighted",
            contentId: mockEnglishContentDto._id,
            parentId: mockEnglishContentDto.parentId,
        });

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

        const wrapper = mount(ActivityHighlighted);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.text()).toContain(french.title);
        });
    });

    it("opens the passages, and filters them by colour", async () => {
        const ranges = [
            { start: 0, end: 5, color: "yellow" as const, text: "first" },
            { start: 10, end: 16, color: "green" as const, text: "second" },
        ];
        await db.setLuminaryInternals("highlights", {
            [mockEnglishContentDto._id]: { ranges, updatedAt: 1 },
        });
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
            expect(wrapper.find("[data-test=activity-open-highlights]").exists()).toBe(true);
        });
        await wrapper.find("[data-test=activity-open-highlights]").trigger("click");

        // Both passages, then only the green one once that colour is picked.
        await waitForExpect(() => {
            expect(wrapper.findAll("[data-test=highlight-text]")).toHaveLength(2);
        });
        await wrapper.find("[data-test=highlight-colour-green]").trigger("click");
        const shown = wrapper.findAll("[data-test=highlight-text]");
        expect(shown).toHaveLength(1);
        expect(shown[0].text()).toBe("second");
    });

    it("shows the passages in a side panel, closed by its own button", async () => {
        const ranges = [{ start: 0, end: 5, color: "yellow" as const, text: "first" }];
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
            expect(wrapper.find("[data-test=activity-open-highlights]").exists()).toBe(true);
        });
        await wrapper.find("[data-test=activity-open-highlights]").trigger("click");

        await waitForExpect(() => {
            // A drawer, not a dialog box: it is pinned to the right edge of the viewport.
            const panel = wrapper.find("aside");
            expect(panel.exists()).toBe(true);
            expect(panel.classes()).toContain("right-0");
            expect(wrapper.find("[data-test=highlight-panel-title]").text()).toBe(
                mockEnglishContentDto.title,
            );
        });

        await wrapper.find("[data-test=highlight-panel-close]").trigger("click");

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=highlight-text]").exists()).toBe(false);
        });
    });
});
