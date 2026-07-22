import { describe, it, expect, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import waitForExpect from "wait-for-expect";
import * as shared from "luminary-shared";
import { DocType, PublishStatus, type ContentDto, type FtsSearchResult } from "luminary-shared";
import { appLanguageIdsAsRef, appSyncedLanguageIdsAsRef } from "@/globalConfig";
import { affinityProfile } from "@/recommendation/affinityStore";
import { computeRichness, fuseTagFts, rank, useRecommendations } from "./useRecommendations";

function makeContent(
    id: string,
    parentTags: string[] = [],
    publishDate?: number,
    parentId = `post-${id}`,
): ContentDto {
    return {
        _id: id,
        type: DocType.Content,
        updatedTimeUtc: 1,
        memberOf: ["group-public-content"],
        parentId,
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

describe("computeRichness", () => {
    it("returns zero for an empty tag list", () => {
        expect(computeRichness({}, [])).toBe(0);
    });

    it("preserves a single tag's high affinity without a fixed-12 dilution", () => {
        expect(computeRichness({ "tag-a": 0.9 }, ["tag-a"])).toBe(0.9);
    });

    it("scores concentrated high-confidence signal above more diffuse lower-confidence signal", () => {
        const concentratedTags = ["tag-a", "tag-b", "tag-c"];
        const concentratedAffinity = Object.fromEntries(concentratedTags.map((tag) => [tag, 0.85]));
        const diffuseTags = ["tag-a", "tag-b", "tag-c", "tag-d", "tag-e", "tag-f"];
        const diffuseAffinity = Object.fromEntries(diffuseTags.map((tag) => [tag, 0.5]));

        expect(computeRichness(concentratedAffinity, concentratedTags)).toBeGreaterThan(
            computeRichness(diffuseAffinity, diffuseTags),
        );
    });

    it("retains the historical result for exactly 12 equally scored tags", () => {
        const tags = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
        const affinity = Object.fromEntries(tags.map((tag) => [tag, 0.5]));

        expect(computeRichness(affinity, tags)).toBe(0.5);
    });
});

describe("fuseTagFts", () => {
    it("accumulates a document found by multiple tags above a single-tag result", () => {
        const shared = makeContent("shared");
        const single = makeContent("single");

        const result = fuseTagFts([
            { weight: 1, results: [makeFtsResult(shared, 10), makeFtsResult(single, 9)] },
            { weight: 0.5, results: [makeFtsResult(shared, 8)] },
        ]);

        expect(result.map((r) => r.docId)).toEqual(["shared", "single"]);
        expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it("ranks a same-position high-weight tag result above a low-weight tag result", () => {
        const highWeight = makeContent("high-weight");
        const lowWeight = makeContent("low-weight");

        const result = fuseTagFts([
            { weight: 1, results: [makeFtsResult(highWeight, 10)] },
            { weight: 0.25, results: [makeFtsResult(lowWeight, 10)] },
        ]);

        expect(result.map((r) => r.docId)).toEqual(["high-weight", "low-weight"]);
    });

    it("returns an empty list for no tag searches", () => {
        expect(fuseTagFts([])).toEqual([]);
    });

    it("preserves normalized 1.0 vs 0.5 affinity contributions at the same rank", () => {
        const topTagResult = makeContent("top-tag");
        const halfAffinityResult = makeContent("half-affinity-tag");

        const result = fuseTagFts([
            { weight: 1, results: [makeFtsResult(topTagResult, 10)] },
            { weight: 0.5, results: [makeFtsResult(halfAffinityResult, 10)] },
        ]);
        const scores = Object.fromEntries(result.map((r) => [r.docId, r.score]));

        expect(scores["top-tag"]).toBeCloseTo(1);
        expect(scores["half-affinity-tag"]).toBeCloseTo(0.5);
        expect(scores["half-affinity-tag"]).toBeCloseTo(scores["top-tag"] * 0.5);
    });
});

describe("useRecommendations FTS retrieval", () => {
    it("does not re-fetch when an upstream recompute produces equal tag queries", async () => {
        const languageId = "lang-eng";
        const tagId = "tag-stable-fts";
        const tagTitleDoc = {
            ...makeContent("content-tag-stable-fts"),
            parentType: DocType.Tag,
            parentId: tagId,
            title: "Stable topic title",
            publishDate: Date.now() - 1_000,
        } as ContentDto;
        const previousLanguages = [...appLanguageIdsAsRef.value];
        const previousSyncedLanguages = [...appSyncedLanguageIdsAsRef.value];
        const previousProfile = affinityProfile.value;
        const ftsSearch = vi.spyOn(shared, "ftsSearch").mockResolvedValue([]);
        const scope = effectScope();

        try {
            await shared.db.docs.put(tagTitleDoc);
            appLanguageIdsAsRef.value = [languageId];
            appSyncedLanguageIdsAsRef.value = [languageId];
            affinityProfile.value = {
                affinity: { [tagId]: 0.8 },
                lastDecayUtc: Date.now(),
            };
            scope.run(() => useRecommendations());

            await waitForExpect(() => expect(ftsSearch).toHaveBeenCalledTimes(1));
            await new Promise((resolve) => setTimeout(resolve, 400));
            expect(ftsSearch).toHaveBeenCalledTimes(1);
            ftsSearch.mockClear();

            affinityProfile.value = { ...affinityProfile.value };
            await nextTick();
            await new Promise((resolve) => setTimeout(resolve, 400));

            expect(ftsSearch).not.toHaveBeenCalled();
        } finally {
            scope.stop();
            ftsSearch.mockRestore();
            affinityProfile.value = previousProfile;
            appLanguageIdsAsRef.value = previousLanguages;
            appSyncedLanguageIdsAsRef.value = previousSyncedLanguages;
            await shared.db.docs.delete(tagTitleDoc._id);
        }
    });

    it("uses saved highlighted text to warm recommendations without topic affinity", async () => {
        const languageId = "lang-eng";
        const highlightedMatch = makeContent("highlight-fts-match");
        const previousLanguages = [...appLanguageIdsAsRef.value];
        const previousSyncedLanguages = [...appSyncedLanguageIdsAsRef.value];
        const previousProfile = affinityProfile.value;
        const previousHighlights = await shared.db.getLuminaryInternals("highlights");
        const ftsSearch = vi
            .spyOn(shared, "ftsSearch")
            .mockResolvedValue([makeFtsResult(highlightedMatch, 10)]);
        const scope = effectScope();

        try {
            await shared.db.setLuminaryInternals("highlights", {
                "content-highlight-source": {
                    html: "<p><mark>Specific highlighted vocabulary</mark></p>",
                    updatedAt: Date.now(),
                },
            });
            appLanguageIdsAsRef.value = [languageId];
            appSyncedLanguageIdsAsRef.value = [languageId];
            affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
            const result = scope.run(() => useRecommendations());
            if (!result) throw new Error("recommendation scope did not initialize");

            await waitForExpect(() => {
                expect(ftsSearch).toHaveBeenCalledWith(
                    expect.objectContaining({
                        query: "Specific highlighted vocabulary",
                        languageId,
                    }),
                );
                expect(result.recommended.value.map((doc) => doc._id)).toContain(
                    highlightedMatch._id,
                );
            });
        } finally {
            scope.stop();
            ftsSearch.mockRestore();
            affinityProfile.value = previousProfile;
            appLanguageIdsAsRef.value = previousLanguages;
            appSyncedLanguageIdsAsRef.value = previousSyncedLanguages;
            await shared.db.setLuminaryInternals("highlights", previousHighlights);
        }
    });
});

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

    it("folds different-language FTS translations by parent and sums their rank signal", () => {
        const now = 1_800_000_000_000;
        const oldPublishDate = now - 20 * 365 * 24 * 60 * 60 * 1000;
        const english = makeContent("post-eng", [], oldPublishDate, "shared-post");
        const french = {
            ...makeContent("post-fra", [], oldPublishDate, "shared-post"),
            language: "lang-fra",
        } as ContentDto;
        const freshCompetitor = makeContent("fresh-competitor", [], now);

        const result = rank(
            [],
            [
                makeFtsResult(english, 10),
                makeFtsResult(french, 9),
                makeFtsResult(freshCompetitor, 8),
            ],
            {},
            { ftsWeight: 0.1, now },
        );

        // Either translation's FTS contribution alone loses to the recency-boosted
        // competitor; their folded contributions together put the first translation first.
        expect(result.map((doc) => doc._id)).toEqual(["post-eng", "fresh-competitor"]);
        expect(result.filter((doc) => doc.parentId === "shared-post")).toHaveLength(1);
    });

    it("keeps the tag-leg translation when FTS returns another translation of the same post", () => {
        const tagTranslation = makeContent("tag-leg-eng", [], undefined, "shared-post");
        const ftsTranslation = {
            ...makeContent("fts-leg-fra", [], undefined, "shared-post"),
            language: "lang-fra",
        } as ContentDto;

        const result = rank(
            [tagTranslation],
            [makeFtsResult(ftsTranslation, 100)],
            {},
            { now: 0 },
        );

        expect(result).toHaveLength(1);
        expect(result[0]._id).toBe("tag-leg-eng");
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

    it("scores all candidate tags while topic-tag resolution is pending", () => {
        const categoryMatch = makeContent("category-match", ["category"]);

        expect(rank([categoryMatch], [], { category: 0.8 }, { now: 0 })[0]._id).toBe(
            "category-match",
        );
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
