import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h, type Slots } from "vue";
import ContentTile from "./ContentTile.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { PlayIcon, PlayIcon as PlayIconOutline } from "@heroicons/vue/24/solid";
import type { ContentDto } from "luminary-shared";
import { setMediaProgress } from "@/globalConfig";
import { computed } from "vue";

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({
        bucketBaseUrl: computed(() => "https://bucket.example.com"),
    }),
}));

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

const RouterLinkStub = {
    props: ["to"],
    setup(props: any, { slots }: { slots: Slots }) {
        return () =>
            h(
                "a",
                {
                    href: "#",
                    onClick: (e: Event) => {
                        e.preventDefault();
                        routePushMock(props.to);
                    },
                },
                slots.default ? slots.default() : "",
            );
    },
};

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
            global: {
                stubs: {
                    RouterLink: RouterLinkStub,
                },
            },
        });

        await wrapper.find("a").trigger("click");

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
            publishDate: 1,
            parentPublishDateVisible: false,
            parentMedia: {
                hlsUrl: "sample-video.mp4",
                fileCollections: [],
            },
        } as unknown as ContentDto;

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

    it("shows the progress and duration if the content has a video", () => {
        const content = {
            _id: "sample-content-id",
            title: "Sample Content",
            slug: "sample-content",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            video: "sample-media-id",
            parentId: "post-blog1",
            parentMedia: {
                hlsUrl: "sample-media-id",
                fileCollections: [],
            },
        } as unknown as ContentDto;

        // Set media progress AND duration in localStorage
        setMediaProgress("sample-media-id", content._id, 120, 300); // 120s played, 300s total

        const wrapper = mount(ContentTile, {
            props: {
                content,
                showProgress: true,
                showPublishDate: true,
                titlePosition: "center",
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

        // Duration 300s = 5:00
        expect(wrapper.html()).toContain("5:00");
        expect(wrapper.html()).toContain('style="width: 40%');
    });
});
