import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SinglePost from "./SinglePost.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockEnglishContent, mockPost } from "@/tests/mockData";

vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        replace: vi.fn(),
    })),
    useRoute: vi.fn().mockImplementation(() => ({
        params: {
            slug: mockPost.content[0].slug,
        },
    })),
}));

describe("SinglePost", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays a video post", async () => {
        const postStore = usePostStore();
        postStore.posts = [mockPost];

        const wrapper = mount(SinglePost, {
            shallow: true,
        });

        expect(wrapper.html()).toContain(mockPost.content[0].title);
        expect(wrapper.html()).toContain(mockPost.tags[0].content[0].title);
        expect(wrapper.html()).toContain("video-player-stub");
    });

    it("displays a text post", async () => {
        const postStore = usePostStore();
        postStore.posts = [
            {
                ...mockPost,
                content: [
                    {
                        ...mockEnglishContent,
                        video: undefined,
                        text: "Test content",
                    },
                ],
            },
        ];

        const wrapper = mount(SinglePost, {
            shallow: true,
        });

        expect(wrapper.html()).not.toContain("video-player-stub");
        expect(wrapper.text()).toContain("Test content");
    });

    it("hides the publish date for a pinned post", async () => {
        const postStore = usePostStore();
        postStore.posts = [
            {
                ...mockPost,
                tags: [
                    {
                        ...mockCategory,
                        pinned: true,
                    },
                ],
            },
        ];

        const wrapper = mount(SinglePost, {
            shallow: true,
        });

        expect(wrapper.html()).not.toContain("January 1, 2024");
    });
});
