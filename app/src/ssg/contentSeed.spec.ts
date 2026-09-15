import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { ContentDto } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { contentByTag } from "@/components/contentByTag";
import {
    CATEGORY_ROW_SEED_FIELDS,
    CONTENT_TILE_SEED_FIELDS,
    projectContentSeed,
} from "./contentSeed";

describe("content seeds", () => {
    it("preserves category membership, dependent-query IDs, heading/layout and row ordering", () => {
        const categories = [
            {
                ...mockEnglishContentDto,
                _id: "category-a",
                parentId: "a",
                parentPinned: 1,
                parentTaggedDocs: ["p1", "p2"],
                parentUseVerticalTileLayout: true,
            },
            {
                ...mockEnglishContentDto,
                _id: "category-b",
                parentId: "b",
                parentPinned: 0,
                parentTaggedDocs: ["p3", "p4"],
            },
        ];
        const docs = [
            {
                ...mockEnglishContentDto,
                _id: "c1",
                parentId: "p1",
                parentTags: ["a"],
                publishDate: 1,
            },
            {
                ...mockEnglishContentDto,
                _id: "c2",
                parentId: "p2",
                parentTags: ["a"],
                publishDate: 2,
            },
            {
                ...mockEnglishContentDto,
                _id: "c3",
                parentId: "p3",
                parentTags: ["b"],
                publishDate: 3,
            },
            {
                ...mockEnglishContentDto,
                _id: "c4",
                parentId: "p4",
                parentTags: ["b"],
                publishDate: 4,
            },
            { ...mockEnglishContentDto, _id: "c5", parentId: "p5", parentTags: [], publishDate: 5 },
        ];
        const renderRows = (content: ContentDto[], tags: ContentDto[]) => {
            const grouped = contentByTag(ref(content), ref(tags), { includeUntagged: true });
            return {
                rows: grouped.tagged.value.map(({ tag, content }) => ({
                    id: tag._id,
                    title: tag.title,
                    summary: tag.summary,
                    vertical: tag.parentUseVerticalTileLayout,
                    ids: content.map((d) => d._id),
                })),
                untagged: grouped.untagged.value.map((d) => d._id),
                childIds: tags.flatMap((d) => d.parentTaggedDocs ?? []),
            };
        };
        const seedDocs = projectContentSeed(docs, CONTENT_TILE_SEED_FIELDS);
        const seedCategories = projectContentSeed(categories, CATEGORY_ROW_SEED_FIELDS);
        expect(renderRows(seedDocs, seedCategories)).toEqual(renderRows(docs, categories));
        expect(seedDocs[0]).not.toHaveProperty("seoString");
        expect(seedCategories[0]).not.toHaveProperty("parentImageData");
    });

    it("retains identity, versions, and custom sort fields without changing input or image keys", () => {
        const doc = { ...mockEnglishContentDto, previousSlugs: ["old"] };
        const before = JSON.stringify(doc);
        const [seed] = projectContentSeed([doc], CONTENT_TILE_SEED_FIELDS, [
            { "parentMedia.hlsUrl": "asc" },
            { author: "desc" },
        ]);
        expect(seed).toMatchObject({
            _id: doc._id,
            type: doc.type,
            updatedTimeUtc: doc.updatedTimeUtc,
            author: doc.author,
        });
        expect(JSON.stringify(seed.parentImageData)).toBe(JSON.stringify(doc.parentImageData));
        expect(seed.parentMedia).toEqual(doc.parentMedia);
        expect(seed).not.toHaveProperty("previousSlugs");
        expect(JSON.stringify(doc)).toBe(before);
        expect(JSON.stringify(seed).length).toBeLessThan(before.length);
    });

    it("keeps unconfigured article/translation queries on the existing exclusion policy", () => {
        const doc = { ...mockEnglishContentDto, previousSlugs: ["old"] };
        const { previousSlugs: _history, ...expected } = doc;
        expect(projectContentSeed([doc])).toEqual([expected]);
        expect(projectContentSeed([], CONTENT_TILE_SEED_FIELDS)).toEqual([]);
    });
});
