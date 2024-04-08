import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HomePage from "./HomePage.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockPost } from "@/tests/mockData";
import { useTagStore } from "@/stores/tag";

vi.mock("vue-router");

describe("HomePage", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays the categories", async () => {
        const postStore = usePostStore();
        const tagStore = useTagStore();
        postStore.posts = [mockPost];
        tagStore.tags = [mockCategory];

        const wrapper = mount(HomePage);

        expect(wrapper.html()).toContain(mockCategory.content[0].title);
    });

    it("does not display an empty category", async () => {
        const tagStore = useTagStore();
        tagStore.tags = [mockCategory];

        const wrapper = mount(HomePage);

        expect(wrapper.html()).not.toContain(mockCategory.content[0].title);
    });

    it("displays the posts", async () => {
        const postStore = usePostStore();
        const tagStore = useTagStore();
        postStore.posts = [mockPost];
        tagStore.tags = [mockCategory];

        const wrapper = mount(HomePage);

        expect(wrapper.html()).toContain(mockPost.content[0].title);
    });
});
