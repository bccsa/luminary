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

    it("can sort posts by content string or number fields", async () => {
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
            sortField: "title",
            sortType: "string",
            sortOrder: "asc",
        });

        expect(res1.length).toBe(2);
        expect(res1[0].content[0].title).toBe("post1");

        // Test string descending sorting
        const res2 = postStore.postsByTag(mockCategory._id, {
            sortField: "title",
            sortType: "string",
            sortOrder: "desc",
        });

        expect(res2.length).toBe(2);
        expect(res2[0].content[0].title).toBe("post2");

        // Test number ascending sorting
        const res3 = postStore.postsByTag(mockCategory._id, {
            sortField: "publishDate",
            sortType: "number",
            sortOrder: "asc",
        });

        expect(res3.length).toBe(2);
        expect(res3[0].content[0].publishDate).toBe(1);

        // Test number descending sorting
        const res4 = postStore.postsByTag(mockCategory._id, {
            sortField: "publishDate",
            sortType: "number",
            sortOrder: "desc",
        });

        expect(res4.length).toBe(2);
        expect(res4[0].content[0].publishDate).toBe(2);
    });
});
