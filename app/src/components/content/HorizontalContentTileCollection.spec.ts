import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import HorizontalContentTileCollection from "./HorizontalContentTileCollection.vue";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";
import { DateTime } from "luxon";
import ContentTile from "./ContentTile.vue";

vi.mock("vue-router");

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("HorizontalContentTileCollection", () => {
    it("displays a content tile", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
            },
        });

        const tile = wrapper.findComponent(ContentTile);

        expect(tile.props().content).toStrictEqual(mockEnglishContentDto);
    });

    it("displays the passed title and the summary", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
                title: "test title",
                summary: "test summary",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("test title");
            expect(wrapper.text()).toContain("test summary");
        });
    });

    it("displays the publish date by default", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
            },
        });

        expect(wrapper.text()).toContain(
            mockEnglishContentDto.publishDate
                ? db
                      .toDateTime(mockEnglishContentDto.publishDate!)
                      .toLocaleString(DateTime.DATETIME_MED)
                : "",
        );
    });

    it("does not display the publish date if the prop is set to false", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
                showPublishDate: false,
            },
        });

        expect(wrapper.text()).not.toContain(
            mockEnglishContentDto.publishDate
                ? db
                      .toDateTime(mockEnglishContentDto.publishDate!)
                      .toLocaleString(DateTime.DATETIME_MED)
                : "",
        );
    });

    it("renders left and right spin buttons", () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
            },
        });

        // Spin button containers should exist
        expect(wrapper.findAll(".group.absolute").length).toBeGreaterThanOrEqual(2);
    });

    it("renders only first batch of content via infinite scroll", () => {
        // Create more than 10 content docs
        const manyDocs = Array.from({ length: 15 }, (_, i) => ({
            ...mockEnglishContentDto,
            _id: `content-${i}`,
        }));

        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: manyDocs,
            },
        });

        const tiles = wrapper.findAllComponents(ContentTile);
        expect(tiles.length).toBe(10); // Initial batch is 10
    });

    it("renders title and summary when provided", () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
                title: "My Section",
                summary: "Section description",
            },
        });

        expect(wrapper.find("h2").text()).toContain("My Section");
        expect(wrapper.find("h2").text()).toContain("Section description");
    });

    it("does not render title when not provided", () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: {
                contentDocs: [mockEnglishContentDto],
            },
        });

        expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("scrolls left when left arrow container is clicked", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: { contentDocs: [mockEnglishContentDto] },
        });

        const scrollElement = wrapper.find(".overflow-x-scroll");
        // Mock scrollLeft as a property
        Object.defineProperty(scrollElement.element, "scrollLeft", {
            value: 100,
            writable: true,
        });

        // Click the left arrow container
        const leftArrowContainer = wrapper.findAll(".group.absolute")[0];
        await leftArrowContainer.trigger("click");

        expect(scrollElement.element.scrollLeft).toBe(0);
    });

    it("scrolls right when right arrow container is clicked", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: { contentDocs: [mockEnglishContentDto] },
        });

        const scrollElement = wrapper.find(".overflow-x-scroll");
        Object.defineProperty(scrollElement.element, "scrollLeft", {
            value: 0,
            writable: true,
        });

        const rightArrowContainer = wrapper.findAll(".group.absolute")[1];
        await rightArrowContainer.trigger("click");

        expect(scrollElement.element.scrollLeft).toBe(100);
    });

    it("shows right spin button when content overflows", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: { contentDocs: [mockEnglishContentDto] },
        });

        const scrollElement = wrapper.find(".overflow-x-scroll");

        // Mock scroll dimensions to simulate overflow
        Object.defineProperty(scrollElement.element, "scrollWidth", { value: 1000, configurable: true });
        Object.defineProperty(scrollElement.element, "clientWidth", { value: 500, configurable: true });
        Object.defineProperty(scrollElement.element, "scrollLeft", { value: 0, writable: true, configurable: true });

        // Mock portrait mode to false (desktop)
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));

        await scrollElement.trigger("scroll");
        await wrapper.vm.$nextTick();

        // Right arrow icon should now be visible (showRightSpin = true since scrollRight > 20)
        // The icon renders as an SVG inside the right arrow container
        const rightContainer = wrapper.findAll(".group.absolute")[1];
        expect(rightContainer.find("svg").exists()).toBe(true);
    });

    it("hides spin buttons in portrait mode", async () => {
        const wrapper = mount(HorizontalContentTileCollection, {
            props: { contentDocs: [mockEnglishContentDto] },
        });

        const scrollElement = wrapper.find(".overflow-x-scroll");

        Object.defineProperty(scrollElement.element, "scrollWidth", { value: 1000, configurable: true });
        Object.defineProperty(scrollElement.element, "clientWidth", { value: 500, configurable: true });
        Object.defineProperty(scrollElement.element, "scrollLeft", { value: 100, writable: true, configurable: true });

        // Mock portrait mode
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

        await scrollElement.trigger("scroll");
        await wrapper.vm.$nextTick();

        // Both spin buttons should be hidden in portrait mode
        // The ArrowLeftCircleIcon and ArrowRightCircleIcon use v-if, so they won't be in the DOM
        expect(wrapper.find(".mt-7.h-10.w-10").exists()).toBe(false);
    });
});
