import { describe, it, expect } from "vitest";
import { DocType, PublishStatus, type ContentDto } from "luminary-shared";
import {
    rank,
    computeRichness,
    affinityScoreScale,
    NOMINAL_COMPLETION_WEIGHT,
} from "./useRecommendations";

// Minimal ContentDto fixtures for the pure rank() — only _id/parentId/parentTags/
// publishDate are read by rank().
function doc(id: string, parentTags: string[], ageDays = 0): ContentDto {
    return {
        _id: id,
        type: DocType.Content,
        parentType: DocType.Post,
        parentId: `post-${id}`,
        updatedTimeUtc: 0,
        memberOf: [],
        parentTags,
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: id,
        title: id,
        publishDate: Date.now() - ageDays * 24 * 60 * 60 * 1000,
    } as ContentDto;
}

const TAG_A = "tag-a";
const TAG_B = "tag-b";

describe("scale-invariant ranking", () => {
    it("affinityScoreScale is a no-op at the nominal completion weight", () => {
        expect(affinityScoreScale(NOMINAL_COMPLETION_WEIGHT)).toBe(1);
        // A 100x smaller completion weight (the rescaled default) maps back x100.
        expect(affinityScoreScale(NOMINAL_COMPLETION_WEIGHT / 100)).toBeCloseTo(
            100,
            10,
        );
    });

    it("computeRichness is invariant to a proportional score+config rescale", () => {
        const tags = [TAG_A, TAG_B];
        const richnessNominal = computeRichness(
            { [TAG_A]: 0.4, [TAG_B]: 0.2 },
            tags,
            1, // nominal scale (default config)
        );
        // Same engagement profile expressed on the 100x finer scale, normalized back x100.
        const richnessRescaled = computeRichness(
            { [TAG_A]: 0.004, [TAG_B]: 0.002 },
            tags,
            100,
        );
        expect(richnessRescaled).toBeCloseTo(richnessNominal, 10);
        expect(richnessNominal).toBeCloseTo(0.3, 10); // mean(0.4,0.2)
    });

    it("rank order is invariant to a proportional score+config rescale (tag leg only)", () => {
        const candidates = [
            doc("both", [TAG_A, TAG_B], 1),
            doc("a-only", [TAG_A], 2),
            doc("b-only", [TAG_B], 3),
        ];
        const topicTagIds = new Set([TAG_A, TAG_B]);

        // Nominal: scores on the 0-1 scale, no scoreScale (default config).
        const nominal = rank(candidates, [], { [TAG_A]: 0.5, [TAG_B]: 0.2 }, {
            topicTagIds,
            scoreScale: 1,
            limit: 3,
        }).map((d) => d._id);

        // Rescaled: same relative engagement on the 100x finer scale, normalized back x100.
        const rescaled = rank(candidates, [], { [TAG_A]: 0.005, [TAG_B]: 0.002 }, {
            topicTagIds,
            scoreScale: 100,
            limit: 3,
        }).map((d) => d._id);

        expect(rescaled).toEqual(nominal);
        // tagAffinity = 0.5*max + 0.5*mean, so the single strong tag (a-only) outranks the
        // two-tag doc whose weaker tag drags its mean down. The point here is that this
        // ordering is identical under the rescaled config, not which doc wins.
        expect(nominal[0]).toBe("a-only");
        expect(nominal).toHaveLength(3);
    });
});