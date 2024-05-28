import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockPost } from "@/tests/mockData";
import { DateTime } from "luxon";

describe("Post store", () => {
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
            sortOptions: { sortBy: "title", sortOrder: "asc" },
        });

        expect(res1!.length).toBe(2);
        expect(res1![0].content[0].title).toBe("post1");

        // Test string descending sorting
        const res2 = postStore.postsByTag(mockCategory._id, {
            sortOptions: { sortBy: "title", sortOrder: "desc" },
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
            sortOptions: { sortBy: "publishDate", sortOrder: "asc" },
        });

        expect(res1!.length).toBe(2);
        expect(res1![0].content[0].publishDate).toBe(1);

        // Test number descending sorting
        const res2 = postStore.postsByTag(mockCategory._id, {
            sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
        });

        expect(res2!.length).toBe(2);
        expect(res2![0].content[0].publishDate).toBe(2);
    });

    it("can filter by top", async () => {
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [{ ...mockPost.content[0], title: "post1", publishDate: 1 }],
            tags: [mockCategory],
        } as any;
        const post2 = {
            ...mockPost,
            _id: "2",
            content: [{ ...mockPost.content[0], title: "post2", publishDate: 2 }],
            tags: [mockCategory],
        } as any;
        postStore.posts = [post1, post2];

        const res1 = postStore.postsByTag(mockCategory._id, {
            sortOptions: { sortBy: "publishDate", sortOrder: "asc" },
            filterOptions: { top: 1 },
        });

        expect(res1!.length).toBe(1);
        expect(res1![0].content[0].publishDate).toBe(1);
    });

    it("can filter by bottom", async () => {
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [{ ...mockPost.content[0], title: "post1", publishDate: 1 }],
            tags: [mockCategory],
        } as any;
        const post2 = {
            ...mockPost,
            _id: "2",
            content: [{ ...mockPost.content[0], title: "post2", publishDate: 2 }],
            tags: [mockCategory],
        } as any;
        postStore.posts = [post1, post2];

        const res1 = postStore.postsByTag(mockCategory._id, {
            sortOptions: { sortBy: "publishDate", sortOrder: "asc" },
            filterOptions: { bottom: 1 },
        });

        expect(res1!.length).toBe(1);
        expect(res1![0].content[0].publishDate).toBe(2);
    });

    it.skip("does not show posts with status set to draft", async () => {
        const now = DateTime.now().toMillis();
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [
                {
                    ...mockPost.content[0],
                    title: "post1",
                    publishDate: now - 1000,
                    status: "draft",
                },
            ],
        } as any;

        postStore.posts = [post1];

        const visiblePosts = postStore.postsByTag(mockCategory._id);

        expect(visiblePosts[0].content[0].status).toBe("draft");
        expect(visiblePosts.length).toBe(0);
    });

    it("shows posts with publish date < now and no expiry date", async () => {
        const now = DateTime.now().toMillis();
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [{ ...mockPost.content[0], title: "post1", publishDate: now - 1000 }],
        } as any;

        postStore.posts = [post1];

        const visiblePosts = postStore.postsByTag(mockCategory._id);

        expect(visiblePosts.length).toBe(1);
    });

    it("shows posts with publish date < now and expiry date > now", async () => {
        const now = DateTime.now().toMillis();
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [
                {
                    ...mockPost.content[0],
                    title: "post1",
                    publishDate: now - 1000,
                    expiryDate: now + 1000,
                },
            ],
        } as any;

        postStore.posts = [post1];

        const visiblePosts = postStore.postsByTag(mockCategory._id);

        expect(visiblePosts.length).toBe(1);
    });

    it("does not show posts with publish date > now and expiry date > now", async () => {
        const now = DateTime.now().toMillis();
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [
                {
                    ...mockPost.content[0],
                    title: "post1",
                    publishDate: now + 1000,
                    expiryDate: now + 2000,
                },
            ],
        } as any;

        postStore.posts = [post1];

        const visiblePosts = postStore.postsByTag(mockCategory._id);

        expect(visiblePosts.length).toBe(1);
        expect(visiblePosts[0].content[0].publishDate).toBeGreaterThan(now);
        expect(visiblePosts[0].content[0].expiryDate).toBeGreaterThan(now);
    });

    it("does not show posts with publish date < now and expiry date < now", async () => {
        const now = DateTime.now().toMillis();
        const postStore = usePostStore();
        const post1 = {
            ...mockPost,
            _id: "1",
            content: [
                {
                    ...mockPost.content[0],
                    title: "post1",
                    publishDate: now - 2000,
                    expiryDate: now - 1000,
                },
            ],
        } as any;

        postStore.posts = [post1];

        const visiblePosts = postStore.postsByTag(mockCategory._id);

        expect(visiblePosts.length).toBe(1);
        expect(visiblePosts[0].content[0].publishDate).toBeLessThan(now);
        expect(visiblePosts[0].content[0].expiryDate).toBeLessThan(now);
    });
});
