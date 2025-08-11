import { nextTick, ref } from "vue";
import { describe, it, expect } from "vitest";
import { contentByTag } from "./contentByTag";
import type { ContentDto } from "luminary-shared";

describe("contentByTag", () => {
    it("reactively adds and removes content and tags", async () => {
        const content = ref([
            { _id: "1", publishDate: 1, parentTags: ["a"] } as ContentDto,
            { _id: "2", publishDate: 2, parentTags: ["b"] } as ContentDto,
        ]);
        const tags = ref([
            { _id: "a", parentId: "a" } as ContentDto,
            { _id: "b", parentId: "b" } as ContentDto,
        ]);

        const result = contentByTag(content, tags);

        // Initial state
        expect(result.tagged.value).toEqual([
            {
                tag: { _id: "b", parentId: "b" },
                newestContentDate: 2,
                content: [{ _id: "2", publishDate: 2, parentTags: ["b"] }],
            },
            {
                tag: { _id: "a", parentId: "a" },
                newestContentDate: 1,
                content: [{ _id: "1", publishDate: 1, parentTags: ["a"] }],
            },
        ]);

        // Add new content
        content.value.push({ _id: "3", publishDate: 3, parentTags: ["a"] } as ContentDto);
        await nextTick();
        expect(result.tagged.value).toEqual([
            {
                tag: { _id: "b", parentId: "b" },
                newestContentDate: 2,
                content: [{ _id: "2", publishDate: 2, parentTags: ["b"] }],
            },
            {
                tag: { _id: "a", parentId: "a" },
                newestContentDate: 1,
                content: [
                    { _id: "1", publishDate: 1, parentTags: ["a"] },
                    { _id: "3", publishDate: 3, parentTags: ["a"] },
                ],
            },
        ]);

        // Remove content
        content.value.splice(0, 1); // Remove content with _id: "1"
        await nextTick();
        expect(result.tagged.value).toEqual([
            {
                tag: { _id: "a", parentId: "a" },
                newestContentDate: 3,
                content: [{ _id: "3", publishDate: 3, parentTags: ["a"] }],
            },
            {
                tag: { _id: "b", parentId: "b" },
                newestContentDate: 2,
                content: [{ _id: "2", publishDate: 2, parentTags: ["b"] }],
            },
        ]);

        // Remove a tag
        tags.value = tags.value.filter((t) => t._id !== "b"); // Remove tag with _id: "b"
        await nextTick();
        expect(result.tagged.value).toEqual([
            {
                tag: { _id: "a", parentId: "a" },
                newestContentDate: 3,
                content: [{ _id: "3", publishDate: 3, parentTags: ["a"] }],
            },
        ]);

        // Remove all content from a tag
        content.value = content.value.filter((c) => c._id !== "3"); // Remove content with _id: "3"
        await nextTick();
        expect(result.tagged.value).toEqual([]);
    });

    it("includes untagged content when includeUntagged option is true", async () => {
        const content = ref([
            { _id: "1", publishDate: 1, parentTags: ["a"] } as ContentDto,
            { _id: "2", publishDate: 2, parentTags: [] } as unknown as ContentDto,
            { _id: "3", publishDate: 3, parentTags: ["b"] } as ContentDto,
        ]);
        const tags = ref([
            { _id: "a", parentId: "a" } as ContentDto,
            { _id: "b", parentId: "b" } as ContentDto,
        ]);

        const result = contentByTag(content, tags, { includeUntagged: true });

        // Initial state
        expect(result.untagged.value).toEqual([{ _id: "2", publishDate: 2, parentTags: [] }]);

        // Add untagged content
        content.value.push({ _id: "4", publishDate: 4, parentTags: [] } as unknown as ContentDto);
        await nextTick();
        expect(result.untagged.value).toEqual([
            { _id: "2", publishDate: 2, parentTags: [] },
            { _id: "4", publishDate: 4, parentTags: [] },
        ]);

        // Remove untagged content
        content.value = content.value.filter((c) => c._id !== "2");
        await nextTick();
        expect(result.untagged.value).toEqual([{ _id: "4", publishDate: 4, parentTags: [] }]);

        // Disable includeUntagged option
        const resultWithoutUntagged = contentByTag(content, tags, { includeUntagged: false });
        await nextTick();
        expect(resultWithoutUntagged.untagged.value).toEqual([]);
    });
});
