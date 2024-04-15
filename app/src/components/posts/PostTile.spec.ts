import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PostTile from "./PostTile.vue";
import { mockPost } from "@/tests/mockData";

vi.mock("vue-router");

describe("PostTile", () => {
    it("renders a tile for a post", async () => {
        const wrapper = mount(PostTile, {
            props: {
                post: mockPost,
            },
        });

        expect(wrapper.text()).toContain(mockPost.content[0].title);
        expect(wrapper.text()).toContain("January 1, 2024");
    });

    it("hides the publish date for a pinned tag", async () => {
        const wrapper = mount(PostTile, {
            props: {
                post: mockPost,
                pinned: true,
            },
        });

        expect(wrapper.text()).not.toContain("January 1, 2024");
    });
});
