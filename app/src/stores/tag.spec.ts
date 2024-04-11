import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mockCategory, mockPost, mockTopic } from "@/tests/mockData";
import { useTagStore } from "./tag";
import { usePostStore } from "./post";
import { TagType } from "@/types";

describe("Tag store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can return tags by tag type with optional filters", async () => {
        const tagStore = useTagStore();
        const postStore = usePostStore();

        const tag1 = {
            ...mockCategory,
            _id: "1",
            content: [{ ...mockCategory.content[0], title: "tag1" }],
        } as any;
        const tag2 = {
            ...mockCategory,
            _id: "2",
            content: [{ ...mockCategory.content[0], title: "tag2" }],
        } as any;
        const tag3 = {
            ...mockTopic,
            _id: "3",
            content: [{ ...mockTopic.content[0], title: "tag3" }],
        } as any;

        const post1 = {
            ...mockPost,
            _id: "1",
            tags: [tag1],
        } as any;
        const post2 = {
            ...mockPost,
            _id: "2",
            tags: [tag2],
        } as any;
        const post3 = {
            ...mockPost,
            _id: "3",
            tags: [tag3],
        } as any;

        // Test without filters (should only return tags with specified TagType)
        tagStore.tags = [tag1, tag2, tag3];
        postStore.posts = [post1, post2, post3];
        const res1 = tagStore.tagsByTagType(TagType.Category);

        expect(res1!.length).toBe(2);
        expect(res1!.some((r) => r.content.some((c) => c.title == "tag1"))).toBe(true);
        expect(res1!.some((r) => r.content.some((c) => c.title == "tag2"))).toBe(true);

        // Test with topLevelOnly filter (should only return tags that are not tagged with other tags of the same tag type)
        tag1.tags = [tag2];
        tagStore.tags = [tag1, tag2, tag3];
        postStore.posts = [post1, post2, post3];
        const res2 = tagStore.tagsByTagType(TagType.Category, {
            filterOptions: { topLevelOnly: true },
        });

        expect(res2!.length).toBe(1);
        expect(res2![0].content[0].title).toBe("tag2");

        // Test with includeEmpty filter (should include tags that are not in use)
        tagStore.tags = [tag1, tag2, tag3];
        postStore.posts = [];
        const res3 = tagStore.tagsByTagType(TagType.Category, {
            filterOptions: { includeEmpty: true },
        });

        expect(res3!.length).toBe(2);
        expect(res3!.some((r) => r.content.some((c) => c.title == "tag1"))).toBe(true);
        expect(res3!.some((r) => r.content.some((c) => c.title == "tag2"))).toBe(true);
    });

    it("can sort by title", async () => {
        const tagStore = useTagStore();

        const tag1 = {
            ...mockCategory,
            _id: "1",
            content: [{ ...mockCategory.content[0], title: "tag1" }],
        } as any;
        const tag2 = {
            ...mockCategory,
            _id: "2",
            content: [{ ...mockCategory.content[0], title: "tag2" }],
        } as any;
        tagStore.tags = [tag1, tag2];

        // Test string ascending sorting
        const res1 = tagStore.tagsByTagType(TagType.Category, {
            filterOptions: { includeEmpty: true },
            sortOptions: { sortBy: "title", sortOrder: "asc" },
        });

        expect(res1!.length).toBe(2);
        expect(res1![0].content[0].title).toBe("tag1");

        // Test string descending sorting
        const res2 = tagStore.tagsByTagType(TagType.Category, {
            filterOptions: { includeEmpty: true },
            sortOptions: { sortBy: "title", sortOrder: "desc" },
        });

        expect(res2!.length).toBe(2);
        expect(res2![0].content[0].title).toBe("tag2");
    });

    it("can sort by publishDate", async () => {
        const tagStore = useTagStore();
        const postStore = usePostStore();

        const tag1 = {
            ...mockCategory,
            _id: "1",
            content: [{ ...mockCategory.content[0], title: "tag1" }],
        } as any;
        const tag2 = {
            ...mockCategory,
            _id: "2",
            content: [{ ...mockCategory.content[0], title: "tag2" }],
        } as any;

        const post1a = {
            ...mockPost,
            _id: "1",
            tags: [tag1],
            content: [{ ...mockPost.content[0], publishDate: 1 }],
        } as any;
        const post1b = {
            ...mockPost,
            _id: "2",
            tags: [tag1],
            content: [{ ...mockPost.content[0], publishDate: 2 }],
        } as any;
        const post2a = {
            ...mockPost,
            _id: "3",
            tags: [tag2],
            content: [{ ...mockPost.content[0], publishDate: 3 }],
        } as any;
        const post2b = {
            ...mockPost,
            _id: "4",
            tags: [tag2],
            content: [{ ...mockPost.content[0], publishDate: 4 }],
        } as any;

        tagStore.tags = [tag1, tag2];
        postStore.posts = [post2b, post1b, post1a, post2a];

        // Test publishDate ascending sorting
        const res1 = tagStore.tagsByTagType(TagType.Category, {
            sortOptions: { sortBy: "publishDate", sortOrder: "asc" },
        });

        expect(res1!.length).toBe(2);
        expect(res1![0].content[0].title).toBe("tag1");

        // Test publishDate descending sorting
        const res2 = tagStore.tagsByTagType(TagType.Category, {
            sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
        });

        expect(res2!.length).toBe(2);
        expect(res2![0].content[0].title).toBe("tag2");
    });

    it("returns pinned content first", async () => {
        const tagStore = useTagStore();
        const postStore = usePostStore();

        // Tag1 should be sorted before tag2 because it is pinned but after tag3 because it's post content has a larger publish date
        const tag1 = {
            ...mockCategory,
            _id: "1",
            content: [{ ...mockCategory.content[0], title: "tag1" }],
            pinned: true,
        } as any;
        const post1 = {
            ...mockPost,
            _id: "10",
            tags: [tag1],
            content: [{ ...mockPost.content[0], publishDate: 3 }],
        } as any;

        // Set tag2's post content to have a smaller publish date so that it should have sorted earlier than tag1 and tag 3 (if tag1 and tag3 were not pinned)
        const tag2 = {
            ...mockCategory,
            _id: "2",
            content: [{ ...mockCategory.content[0], title: "tag2" }],
            pinned: false,
        } as any;
        const post2 = {
            ...mockPost,
            _id: "20",
            tags: [tag2],
            content: [{ ...mockPost.content[0], publishDate: 1 }],
        } as any;

        // Tag3 should be sorted before tag1 because it's post content has a smaller publish date and before tag2 because it is pinned
        const tag3 = {
            ...mockCategory,
            _id: "3",
            content: [{ ...mockCategory.content[0], title: "tag3" }],
            pinned: true,
        } as any;
        const post3 = {
            ...mockPost,
            _id: "30",
            tags: [tag3],
            content: [{ ...mockPost.content[0], publishDate: 2 }],
        } as any;

        tagStore.tags = [tag1, tag2, tag3];
        postStore.posts = [post1, post2, post3];

        const res = tagStore.tagsByTagType(TagType.Category, {
            sortOptions: { sortBy: "publishDate", sortOrder: "asc" },
        });

        expect(res!.length).toBe(3);
        expect(res![0].content[0].title).toBe("tag3");
        expect(res![1].content[0].title).toBe("tag1");
        expect(res![2].content[0].title).toBe("tag2");
    });
});
