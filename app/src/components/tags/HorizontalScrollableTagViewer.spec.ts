import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HorizontalScrollableTagViewer from "./HorizontalScrollableTagViewer.vue";
import { mockCategoryContentDto, mockCategoryDto, mockEnglishContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";

vi.mock("vue-router");

describe("HorizontalScrollableTagViewer", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockCategoryContentDto, mockCategoryDto]);
    });

    afterEach(async () => {
        await db.docs.clear();
        vi.clearAllMocks();
    });

    it("displays the title and the summary of the passed TagDto", async () => {
        const wrapper = mount(HorizontalScrollableTagViewer, {
            props: {
                tag: mockCategoryDto,
                queryOptions: { languageId: "lang-eng" },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            expect(wrapper.text()).toContain(mockCategoryContentDto.summary);
        });
    });

    it("displays the title if manually defined", async () => {
        const wrapper = mount(HorizontalScrollableTagViewer, {
            props: {
                title: "Newest Content",
                queryOptions: { filterOptions: { limit: 10 }, languageId: "lang-eng" },
            },
        });

        expect(wrapper.text()).toContain("Newest Content");
    });

    // This test is showing a Vue warn in the console.
    //It should be a warning comming from the router in one of the child components.
    it("displays a ContentTile", async () => {
        db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mount(HorizontalScrollableTagViewer, {
            props: {
                tag: mockCategoryDto,
                queryOptions: { languageId: "lang-eng" },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.html()).toContain(mockEnglishContentDto.image);
        });
    });
});
