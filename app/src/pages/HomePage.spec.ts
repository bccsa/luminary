import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HomePage from "./HomePage.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockPost } from "@/tests/mockData";
import { useTagStore } from "@/stores/tag";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";

vi.mock("vue-router");
vi.mock("@auth0/auth0-vue");

describe("HomePage", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays a message when there are no posts", async () => {
        const postStore = usePostStore();
        postStore.posts = [];

        const wrapper = mount(HomePage);

        expect(wrapper.text()).not.toBe("");
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
