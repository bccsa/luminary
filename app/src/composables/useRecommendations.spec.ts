import { describe, it, expect } from "vitest";
import { DocType, PublishStatus, type ContentDto, type FtsSearchResult } from "luminary-shared";
import { rank } from "./useRecommendations";

function makeContent(id: string, parentTags: string[] = []): ContentDto {
    return {
        _id: id,
        type: DocType.Content,
        updatedTimeUtc: 1,
        memberOf: ["group-public-content"],
        parentId: `post-${id}`,
        parentTags,
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: id,
        title: id,
    } as ContentDto;
}

function makeFtsResult(doc: ContentDto, score: number): FtsSearchResult {
    return { docId: doc._id, score, wordMatchScore: 0, doc };
}

describe("rank (RRF fusion)", () => {
    it("ranks a doc found in both legs above one found in only one leg", () => {
        const both = makeContent("both", ["tag-a"]);
        const tagOnly = makeContent("tag-only", ["tag-a"]);
        const ftsOnly = makeContent("fts-only");

        const result = rank(
            [both, tagOnly], // tag leg: "both" and "tag-only" tied on affinity
            [makeFtsResult(both, 10), makeFtsResult(ftsOnly, 5)], // fts leg: "both" ranks above "fts-only"
            { "tag-a": 0.5 },
        );

        // "both" appears in both lists at rank 1 each -> highest combined RRF score.
        expect(result[0]._id).toBe("both");
        expect(result.map((d) => d._id)).toEqual(
            expect.arrayContaining(["both", "tag-only", "fts-only"]),
        );
    });

    it("surfaces an FTS-only match even though it has no tag overlap at all", () => {
        const tagOnly = makeContent("tag-only", ["tag-a"]);
        const ftsOnly = makeContent("fts-only"); // no parentTags — the tag leg would never find this

        const result = rank([tagOnly], [makeFtsResult(ftsOnly, 3)], { "tag-a": 0.9 });

        expect(result.map((d) => d._id)).toContain("fts-only");
    });

    it("does not duplicate a doc present in both legs", () => {
        const both = makeContent("both", ["tag-a"]);

        const result = rank([both], [makeFtsResult(both, 1)], { "tag-a": 0.5 });

        expect(result).toHaveLength(1);
    });

    it("returns an empty list when both legs are empty", () => {
        expect(rank([], [], {})).toEqual([]);
    });
});
