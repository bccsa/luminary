import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HorizontalScrollableTagViewer from "./HorizontalScrollableTagViewer.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockPost } from "@/tests/mockData";
import { useTagStore } from "@/stores/tag";

vi.mock("vue-router");

describe("HorizontalScrollableTagViewer", () => {
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

        const wrapper = mount(HorizontalScrollableTagViewer, {
            props: { tag: mockCategory },
        });

        expect(wrapper.html()).toContain(mockCategory.content[0].title);
    });
});
