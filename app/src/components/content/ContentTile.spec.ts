import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentTile from "./ContentTile.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { PlayIcon, PlayIcon as PlayIconOutline } from "@heroicons/vue/24/solid";
import type { ContentDto } from "luminary-shared";

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
        expect(wrapper.find("img").attributes("srcset")).toContain("test-image.webp");
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

        await wrapper.findAll("div")[0].trigger("click");

        expect(routePushMock).toHaveBeenCalledWith({
            name: "content",
            params: { slug: mockEnglishContentDto.slug },
        });
    });

    it("renders the play icon if the content has a video", () => {
        const content = {
            title: "Sample Content",
            slug: "sample-content",
            parentImageData: {},
            video: "sample-video.mp4",
            publishDate: 1,
            parentPublishDateVisible: false,
        } as ContentDto;

        const wrapper = mount(ContentTile, {
            props: {
                content,
            },
            global: {
                stubs: {
                    LImage: {
                        template: "<div><slot></slot><slot name='imageOverlay'></slot></div>",
                    },
                    PlayIcon,
                    PlayIconOutline,
                },
            },
        });

        const playIcon = wrapper.findComponent(PlayIcon);
        const playIconOutline = wrapper.findComponent(PlayIconOutline);

        expect(playIcon.exists()).toBe(true);
        expect(playIconOutline.exists()).toBe(true);
    });

    it("does not render the play icon if the content does not have a video", () => {
        const content = {
            title: "Sample Content",
            slug: "sample-content",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
        } as ContentDto;

        const wrapper = mount(ContentTile, {
            props: {
                content,
            },
            global: {
                stubs: {
                    LImage: {
                        template: "<div><slot></slot><slot name='imageOverlay'></slot></div>",
                    },
                    PlayIcon,
                    PlayIconOutline,
                },
            },
        });

        const playIcon = wrapper.findComponent(PlayIcon);
        const playIconOutline = wrapper.findComponent(PlayIconOutline);

        expect(playIcon.exists()).toBe(false);
        expect(playIconOutline.exists()).toBe(false);
    });
});
