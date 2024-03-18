import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HomePage from "./HomePage.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockPost } from "@/tests/mockData";

vi.mock("vue-router");

describe("HomePage", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays the posts", async () => {
        const postStore = usePostStore();
        postStore.posts = [mockPost];

        const wrapper = mount(HomePage);

        expect(wrapper.html()).toContain(mockPost.content[0].title);
    });
});
