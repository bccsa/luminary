import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HorizontalScrollableLastPostViewer from "./HorizontalScrollableLastPostViewer.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockPost } from "@/tests/mockData";
import { DateTime } from "luxon";

vi.mock("vue-router");

const createMockPost = (id: string, title: string, date: DateTime) => ({
    ...mockPost,
    _id: id,
    content: [{ ...mockPost.content[0], title, publishDate: date.toMillis() }],
});

describe("HorizontalScrollableLastPostViewer", () => {
    let wrapper: any;
    let store: any;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = usePostStore();
        store.posts = [
            createMockPost("1", "post1", DateTime.fromObject({ year: 2024, month: 5, day: 20 })),
            createMockPost("2", "post2", DateTime.fromObject({ year: 2024, month: 5, day: 18 })),
            createMockPost("3", "post3", DateTime.fromObject({ year: 2024, month: 5, day: 19 })),
        ];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders correctly", () => {
        wrapper = mount(HorizontalScrollableLastPostViewer);
        expect(wrapper.exists()).toBe(true);
    });

    it("displays posts", () => {
        wrapper = mount(HorizontalScrollableLastPostViewer);
        const postTiles = wrapper.findAllComponents({ name: "PostTile" });
        expect(postTiles.length).toBe(store.posts.length);
    });

    it("displays posts from newest to oldest", () => {
        const post1 = createMockPost(
            "1",
            "post1",
            DateTime.fromObject({ year: 2024, month: 5, day: 20 }),
        );
        const post2 = createMockPost(
            "2",
            "post2",
            DateTime.fromObject({ year: 2024, month: 5, day: 18 }),
        );
        const post3 = createMockPost(
            "3",
            "post3",
            DateTime.fromObject({ year: 2024, month: 5, day: 19 }),
        );

        store.posts = [post1, post2, post3];

        wrapper = mount(HorizontalScrollableLastPostViewer);

        const postTiles = wrapper.findAllComponents({ name: "PostTile" });
        const postTitles = postTiles.map((wrapper: any) => wrapper.props("post").content[0].title);
        console.log(postTiles[1]);

        expect(postTiles.length).toBe(store.posts.length);
        expect(postTitles).toEqual(["post1", "post3", "post2"]);
    });
});
