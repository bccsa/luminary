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
        await db.docs.bulkPut([mockCategoryContentDto, mockCategoryDto, mockEnglishContentDto]);
    });

    afterEach(async () => {
        await db.docs.clear();
        vi.clearAllMocks();
    });

    it("displays appropriate message when there is no content in current language.", async () => {
        const wrapper = mount(HorizontalScrollableTagViewer, {
            props: {
                tag: mockCategoryDto,
                queryOptions: { languageId: "lang-test" },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(
                "No translation found We are currently working on providing content in your preferred language. In the meantime, feel free to explore available content in other languages.",
            );
        });
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

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Newest Content");
        });
    });

    // This test is showing a Vue warn in the console.
    //It should be a warning comming from the router in one of the child components.
    it("displays a ContentTile", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mount(HorizontalScrollableTagViewer, {
            props: {
                tag: mockCategoryDto,
                queryOptions: { languageId: "lang-eng" },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.html()).toContain(
                mockEnglishContentDto.parentImageData?.fileCollections[0].imageFiles[0].filename,
            );
        });
    });
});
