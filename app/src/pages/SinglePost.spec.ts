import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SinglePost from "./SinglePost.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockPost } from "@/tests/mockData";

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

    it("displays the post", async () => {
        const postStore = usePostStore();
        postStore.posts = [mockPost];

        const wrapper = mount(SinglePost);

        expect(wrapper.html()).toContain(mockPost.content[0].title);
        expect(wrapper.html()).toContain(mockPost.tags[0].content[0].title);
    });
});
