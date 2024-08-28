import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentTile from "./ContentTile.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";

const routePushMock = vi.fn();

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: routePushMock,
        }),
    };
});

describe("ContentTile", () => {
    it("renders the image of content", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });
        expect(wrapper.find("img").exists()).toBe(true);
        expect(wrapper.find("img").attributes("src")).toBe("test-image.jpg");
    });

    it("renders a tile for a post", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).toContain("Post 1");
        expect(wrapper.text()).toContain("Jan 1, 2024");
    });

    it("display the publish date", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).toContain("Jan 1, 2024");
    });

    it("can hide the publish date", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
                showPublishDate: false,
            },
        });

        expect(wrapper.text()).not.toContain("Jan 1, 2024");
    });

    it("hides the publishDate if publishDateVisible is false", async () => {
        const mockContent = { ...mockEnglishContentDto, parentPublishDateVisible: false };
        const wrapper = mount(ContentTile, {
            props: {
                content: mockContent,
            },
        });
        expect(wrapper.text()).not.toContain("Jan 1, 2024");
    });

    it("navigates to the correct route on click", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });

        await wrapper.trigger("click");

        expect(routePushMock).toHaveBeenCalledWith({
            name: "content",
            params: { slug: mockEnglishContentDto.slug },
        });
    });
});
