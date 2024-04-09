import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockPost } from "@/tests/mockData";

describe("HomePage", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can sort posts by title", async () => {
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [{ ...mockPost.content[0], title: "post1", publishDate: 1 }],
        } as any;
        const post2 = {
            ...mockPost,
            _id: "2",
            content: [{ ...mockPost.content[0], title: "post2", publishDate: 2 }],
        } as any;
        postStore.posts = [post1, post2];

        // Test string ascending sorting
        const res1 = postStore.postsByTag(mockCategory._id, {
            sortBy: "title",
            sortOrder: "asc",
        });

        expect(res1!.length).toBe(2);
        expect(res1![0].content[0].title).toBe("post1");

        // Test string descending sorting
        const res2 = postStore.postsByTag(mockCategory._id, {
            sortBy: "title",
            sortOrder: "desc",
        });

        expect(res2!.length).toBe(2);
        expect(res2![0].content[0].title).toBe("post2");
    });

    it("can sort posts by publishDate", async () => {
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [{ ...mockPost.content[0], title: "post1", publishDate: 1 }],
        } as any;
        const post2 = {
            ...mockPost,
            _id: "2",
            content: [{ ...mockPost.content[0], title: "post2", publishDate: 2 }],
        } as any;
        postStore.posts = [post1, post2];

        // Test number ascending sorting
        const res1 = postStore.postsByTag(mockCategory._id, {
            sortBy: "publishDate",
            sortOrder: "asc",
        });

        expect(res1!.length).toBe(2);
        expect(res1![0].content[0].publishDate).toBe(1);

        // Test number descending sorting
        const res2 = postStore.postsByTag(mockCategory._id, {
            sortBy: "publishDate",
            sortOrder: "desc",
        });

        expect(res2!.length).toBe(2);
        expect(res2![0].content[0].publishDate).toBe(2);
    });
});
