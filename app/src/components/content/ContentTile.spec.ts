import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h, type Slots } from "vue";
import ContentTile from "./ContentTile.vue";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { PlayIcon, PlayIcon as PlayIconOutline } from "@heroicons/vue/24/solid";
import type { ContentDto } from "luminary-shared";
import { setMediaProgress, setReadingProgress } from "@/contentProgress";
import { computed } from "vue";

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({
        bucketBaseUrl: computed(() => "https://bucket.example.com"),
    }),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
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

    it("renders a Coming soon overlay and is not clickable when parentShowComingSoon is true", () => {
        const scheduledContent = {
            ...mockEnglishContentDto,
            publishDate: Date.now() + 60_000,
            parentShowComingSoon: true,
        };

        const wrapper = mount(ContentTile, {
            props: {
                content: scheduledContent,
            },
        });

        expect(wrapper.text()).toContain("Coming soon");
        expect(wrapper.find("a").exists()).toBe(false);
    });

    it("does not show a Coming soon overlay when parentShowComingSoon is omitted", () => {
        const scheduledContent = {
            ...mockEnglishContentDto,
            publishDate: Date.now() + 60_000,
        };

        const wrapper = mount(ContentTile, {
            props: {
                content: scheduledContent,
            },
            global: {
                stubs: { RouterLink: { template: "<a><slot /></a>" } },
            },
        });

        expect(wrapper.text()).not.toContain(
            mockLanguageDtoEng.translations["content.coming_soon"],
        );
        expect(wrapper.find("a").exists()).toBe(true);
    });

    it("renders the play icon if the content has a video", () => {
        const content = {
            title: "Sample Content",
            slug: "sample-content",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            video: "sample-video.mp4",
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

    it("shows the progress bar if the content has a video", () => {
        const content = {
            _id: "sample-content-id",
            title: "Sample Content",
            slug: "sample-content",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            video: "sample-media-id",
            parentId: "post-blog1",
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

        expect(wrapper.html()).toContain('style="width: 40%');
        expect(wrapper.html()).not.toContain("5:00");
    });

    it("does not show media progress when showProgress is false", () => {
        const content = {
            _id: "sample-content-id-hidden",
            title: "Sample Content",
            slug: "sample-content-hidden",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            video: "sample-media-id-hidden",
            parentId: "post-blog1",
        } as unknown as ContentDto;

        setMediaProgress("sample-media-id-hidden", content._id, 120, 300);

        const wrapper = mount(ContentTile, {
            props: {
                content,
                showProgress: false,
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

        expect(wrapper.html()).not.toContain("5:00");
        expect(wrapper.html()).not.toContain('style="width: 40%');
    });

    it("shows a progress bar for reading-only content when showProgress is true", () => {
        const content = {
            _id: "sample-reading-id",
            title: "Reading Article",
            slug: "reading-article",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            text: "<p>Hello</p>",
            parentId: "post-blog1",
        } as unknown as ContentDto;

        setReadingProgress(content._id, 45);

        const wrapper = mount(ContentTile, {
            props: {
                content,
                showProgress: true,
                titlePosition: "center",
            },
            global: {
                stubs: {
                    LImage: {
                        template: "<div><slot></slot><slot name='imageOverlay'></slot></div>",
                    },
                },
            },
        });

        expect(wrapper.html()).toContain('style="width: 45%');
    });

    it("shows reading progress when it is higher than video progress", () => {
        const content = {
            _id: "sample-mixed-id",
            title: "Mixed Content",
            slug: "mixed-content",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            video: "sample-mixed-media-id",
            text: "<p>Hello</p>",
            parentId: "post-blog1",
        } as unknown as ContentDto;

        setMediaProgress("sample-mixed-media-id", content._id, 120, 300); // 40%
        setReadingProgress(content._id, 60);

        const wrapper = mount(ContentTile, {
            props: {
                content,
                showProgress: true,
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

        expect(wrapper.html()).toContain('style="width: 60%');
    });

    it("shows video progress when it is higher than reading progress", () => {
        const content = {
            _id: "sample-mixed-id-2",
            title: "Mixed Content 2",
            slug: "mixed-content-2",
            parentImageData: {},
            publishDate: 1,
            parentPublishDateVisible: false,
            video: "sample-mixed-media-id-2",
            text: "<p>Hello</p>",
            parentId: "post-blog1",
        } as unknown as ContentDto;

        setMediaProgress("sample-mixed-media-id-2", content._id, 210, 300); // 70%
        setReadingProgress(content._id, 30);

        const wrapper = mount(ContentTile, {
            props: {
                content,
                showProgress: true,
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

        expect(wrapper.html()).toContain('style="width: 70%');
    });

    it("renders title on the image in overlay mode without text below", () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
                titlePosition: "overlay",
                aspectRatio: "portrait",
                imageSize: "thumbnailCompact",
            },
            global: {
                stubs: {
                    LImage: {
                        template: "<div><slot></slot><slot name='imageOverlay'></slot></div>",
                    },
                },
            },
        });

        expect(wrapper.text()).toContain("Post 1");
        expect(wrapper.text()).toContain("Jan 1, 2024");
        expect(wrapper.find(".mt-1.truncate.text-sm").exists()).toBe(false);
        expect(wrapper.find(".line-clamp-2").exists()).toBe(true);
    });

    it("renders overlay label instead of publish date when provided", () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
                titlePosition: "overlay",
                overlayLabel: "SERMONS",
                showPublishDate: true,
            },
            global: {
                stubs: {
                    LImage: {
                        template: "<div><slot></slot><slot name='imageOverlay'></slot></div>",
                    },
                },
            },
        });

        expect(wrapper.text()).toContain("SERMONS");
        expect(wrapper.text()).not.toContain("Jan 1, 2024");
    });
});
