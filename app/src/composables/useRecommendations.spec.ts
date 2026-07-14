import { describe, it, expect } from "vitest";
import { DocType, PublishStatus, type ContentDto, type FtsSearchResult } from "luminary-shared";
import { rank } from "./useRecommendations";

function makeContent(id: string, parentTags: string[] = [], publishDate?: number): ContentDto {
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
        publishDate,
    } as ContentDto;
}

function makeFtsResult(doc: ContentDto, score: number): FtsSearchResult {
    return { docId: doc._id, score, wordMatchScore: 0, doc };
}

describe("rank", () => {
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

    it("keeps calibrated tag-affinity gaps instead of flattening them into tag-leg ranks", () => {
        const strong = makeContent("strong", ["strong-tag"]);
        const weak = makeContent("weak", ["weak-tag"]);

        expect(
            rank([weak, strong], [], { "strong-tag": 0.9, "weak-tag": 0.02 }).map((d) => d._id),
        ).toEqual(["strong", "weak"]);
    });

    it("uses normalized FTS rank, so the top FTS result is not overwhelmed by recency", () => {
        const now = 1_800_000_000_000;
        const newest = makeContent("newest", [], now);
        const topFts = makeContent("top-fts", [], now - 20 * 365 * 24 * 60 * 60 * 1000);
        const middle = Array.from({ length: 18 }, (_, i) => makeContent(`middle-${i}`));

        expect(
            rank(
                [],
                [topFts, ...middle, newest].map((doc, i) => makeFtsResult(doc, 20 - i)),
                {},
                { now },
            )[0]._id,
        ).toBe("top-fts");
    });

    it("scores only topic tags and does not cap FTS-only documents on an arbitrary zero-score tag", () => {
        const topicMatch = makeContent("topic-match", ["topic", "category"]);
        const categoryOnly = makeContent("category-only", ["category"]);
        const zeroScoreFts = Array.from({ length: 4 }, (_, i) =>
            makeContent(`fts-${i}`, ["unmatched-topic"]),
        );
        const topicTagIds = new Set(["topic", "unmatched-topic"]);

        const result = rank(
            [topicMatch, categoryOnly],
            zeroScoreFts.map((doc, i) => makeFtsResult(doc, 10 - i)),
            { topic: 0.8, category: 1 },
            { topicTagIds, now: 0 },
        );

        // The category score must not count: only the actual Topic-tag match leads.
        expect(result[0]._id).toBe("topic-match");
        // No affinity exists for `unmatched-topic`, so all four FTS documents remain
        // uncapped rather than sharing an arbitrary dominant tag.
        expect(
            result.filter((doc) => doc._id.startsWith("fts-")).map((doc) => doc._id),
        ).toHaveLength(4);
    });

    it("stops diversity selection once the requested output limit is filled", () => {
        const docs = Array.from({ length: 50 }, (_, i) => makeContent(`doc-${i}`, ["tag-a"]));

        const result = rank(docs, [], { "tag-a": 0.8 }, { now: 0, limit: 2 });

        expect(result).toHaveLength(2);
        expect(result.map((doc) => doc._id)).toEqual(["doc-0", "doc-1"]);
    });

    it("truncates overflow docs that were diversity-capped before the limit was reached", () => {
        // 4 tag-a docs with MAX_PER_DOMINANT_TAG=3 pushes the 4th into `overflow` while
        // `selected` is still short of `limit` — `selected` only reaches 5 once the
        // tag-b docs are appended. Without the trailing slice(0, limit), the demoted
        // 4th tag-a doc would still be appended to the result, returning 6 instead of 5.
        const tagADocs = Array.from({ length: 4 }, (_, i) => makeContent(`tag-a-${i}`, ["tag-a"]));
        const tagBDocs = Array.from({ length: 3 }, (_, i) => makeContent(`tag-b-${i}`, ["tag-b"]));

        const result = rank(
            [...tagADocs, ...tagBDocs],
            [],
            { "tag-a": 0.8, "tag-b": 0.5 },
            { now: 0, limit: 5 },
        );

        expect(result).toHaveLength(5);
        expect(result.map((doc) => doc._id)).not.toContain("tag-a-3");
    });
});
