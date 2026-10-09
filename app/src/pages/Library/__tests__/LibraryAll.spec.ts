import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { setReadingProgress, syncContentProgressFromStorage } from "@/contentProgress";
import { userActivityDb } from "@/userActivity/db";
import { getAllUserActivity, recordUserActivity } from "@/userActivity/store";
import { HIGHLIGHT_COLORS, type HighlightRange } from "@/util/highlightRanges";
import LibraryAll from "../LibraryAll.vue";

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

const range = (text: string): HighlightRange => ({
    start: 0,
    end: text.length,
    color: "yellow",
    text,
});

describe("LibraryAll", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        appLanguageIdsAsRef.value.unshift(mockLanguageDtoEng._id);

        await db.docs.bulkPut([mockEnglishContentDto]);
        await userActivityDb.userActivity.clear();

        localStorage.removeItem("contentProgress");
        syncContentProgressFromStorage();

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("displays a message when there is no activity", async () => {
        const wrapper = mount(LibraryAll);

        expect(wrapper.text()).toContain(
            "Everything you read, like or highlight will show up here.",
        );
    });

    it("shows one card per activity, so a post read and liked appears twice", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });
        await recordUserActivity({ type: "liked", parentId: mockEnglishContentDto.parentId });

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-remove-viewed]").exists()).toBe(true);
            expect(wrapper.find("[data-test=library-remove-liked]").exists()).toBe(true);
        });
    });

    it("marks a like, and nothing else — a highlight is told by its coloured passage", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });
        await recordUserActivity({ type: "liked", parentId: mockEnglishContentDto.parentId });
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [range("a passage")] },
        );

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-liked-icon]").exists()).toBe(true);
        });
        // Only the like is marked: a view needs none, and a highlight is told by its passage.
        expect(wrapper.findAll("[data-test=library-liked-icon]")).toHaveLength(1);
        // The heart is the only thing setting the liked card apart, so it has to be readable.
        expect(wrapper.find("[data-test=library-liked-icon]").text()).toBe("Liked");
    });

    it("leaves the publish date off, keeping the room for the activity", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
        expect(wrapper.text()).not.toContain("Jan 1, 2024");
    });

    it("shows reading progress on a view only, not on a like of the same post", async () => {
        setReadingProgress(mockEnglishContentDto._id, 40);
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });
        await recordUserActivity({ type: "liked", parentId: mockEnglishContentDto.parentId });

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-remove-liked]").exists()).toBe(true);
        });
        expect(wrapper.findAll("[role=progressbar]")).toHaveLength(1);
    });

    it("groups the feed under a date heading", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-group-today]").exists()).toBe(true);
        });
        expect(wrapper.text()).toContain("Today");
    });

    it("removes the one activity its card stands for, leaving the others", async () => {
        await recordUserActivity({ type: "viewed", parentId: mockEnglishContentDto.parentId });
        await recordUserActivity({ type: "liked", parentId: mockEnglishContentDto.parentId });

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-remove-liked]").exists()).toBe(true);
        });
        await wrapper.find("[data-test=library-remove-liked]").trigger("click");

        await waitForExpect(async () => {
            expect((await getAllUserActivity()).map((row) => row.type)).toEqual(["viewed"]);
        });
    });

    it("opens the passages of a highlight rather than navigating", async () => {
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [range("first passage"), range("second passage")] },
        );

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-open-highlights]").exists()).toBe(true);
        });
        await wrapper.find("[data-test=library-open-highlights]").trigger("click");

        await waitForExpect(() => {
            expect(wrapper.findAll("[data-test=highlight-text]")).toHaveLength(2);
        });
    });

    it("shows the highlighted passage in place of the summary", async () => {
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [range("the passage they kept")] },
        );

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("the passage they kept");
        });
        expect(wrapper.text()).not.toContain(mockEnglishContentDto.summary);
    });

    it("paints the passage in the colour it was highlighted in", async () => {
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [{ start: 0, end: 5, color: "green", text: "green passage" }] },
        );

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-excerpt]").exists()).toBe(true);
        });
        expect(wrapper.find("[data-test=library-excerpt]").attributes("style")).toContain(
            HIGHLIGHT_COLORS.green,
        );
    });

    it("does not let the card's capture swallow its remove button", async () => {
        await recordUserActivity(
            {
                type: "highlighted",
                contentId: mockEnglishContentDto._id,
                parentId: mockEnglishContentDto.parentId,
            },
            { ranges: [range("a passage")] },
        );

        const wrapper = mount(LibraryAll);

        await waitForExpect(() => {
            expect(wrapper.find("[data-test=library-remove-highlighted]").exists()).toBe(true);
        });
        await wrapper.find("[data-test=library-remove-highlighted]").trigger("click");

        await waitForExpect(async () => {
            expect(await getAllUserActivity()).toEqual([]);
        });
        // The passages dialog must not have opened in its place.
        expect(wrapper.find("[data-test=highlight-text]").exists()).toBe(false);
    });
});
