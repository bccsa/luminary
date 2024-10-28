import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import HorizontalContentTileCollection from "./HorizontalContentTileCollection.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";
import { DateTime } from "luxon";
import ContentTile from "./ContentTile.vue";

vi.mock("vue-router");

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
});
