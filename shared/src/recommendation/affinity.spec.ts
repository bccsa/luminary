import { describe, it, expect } from "vitest";
import {
    applyEvent,
    decay,
    EventWeight,
    readingDepthWeight,
    tierWeightForRank,
    topTags,
} from "./affinity";
import type { AffinityMap } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

describe("affinity scoring", () => {
    it("builds confidence gradually from ordinary opens", () => {
        let p = applyEvent(undefined, ["tag-a"], T0);
        expect(p.affinity["tag-a"]).toBeCloseTo(0.04, 5);

        // Ten casual opens on the same lone topic only reach roughly a third
        // confidence. Each repeat closes a damped fraction of the remaining gap, so
        // click-heavy browsing cannot instantly dominate the profile.
        for (let i = 0; i < 9; i++) p = applyEvent(p, ["tag-a"], T0);
        expect(p.affinity["tag-a"]).toBeCloseTo(0.3232, 3);
        expect(p.affinity["tag-a"]).toBeLessThan(0.35);

        for (let i = 0; i < 20; i++) p = applyEvent(p, ["tag-a"], T0);
        expect(p.affinity["tag-a"]).toBeLessThan(1);
        expect(p.affinity["tag-a"]).toBeLessThan(0.75);
    });

    it("does not damp the seeding event for a brand-new tag, but damps repeats", () => {
        // A tag with no prior evidence isn't part of the "breadth" depth damping guards
        // against, so its first event moves at full weight regardless of profile size —
        // otherwise a new interest seeds barely above MIN_SCORE and gets capped away on
        // the same tick it's born.
        const sparse = applyEvent({ affinity: {}, lastDecayUtc: T0 }, ["new"], T0);

        const broadAffinity: AffinityMap = {};
        for (let i = 0; i < 40; i++) broadAffinity[`existing-${i}`] = 0.5;
        const broad = applyEvent({ affinity: broadAffinity, lastDecayUtc: T0 }, ["new"], T0);

        expect(broad.affinity["new"]).toBeCloseTo(sparse.affinity["new"], 10);

        // Once the tag has prior evidence, a second event on it damps with profile
        // breadth exactly as before.
        const sparseAgain = applyEvent(sparse, ["new"], T0);
        const broadAgain = applyEvent(broad, ["new"], T0);
        expect(broadAgain.affinity["new"] - broad.affinity["new"]).toBeLessThan(
            sparseAgain.affinity["new"] - sparse.affinity["new"],
        );
    });

    it("gives high-intent events much stronger evidence than an ordinary open", () => {
        const open = applyEvent(undefined, ["open"], T0);
        const bookmark = applyEvent(undefined, ["bookmark"], T0, EventWeight.Bookmark);
        const completion = applyEvent(undefined, ["completion"], T0, EventWeight.Completion);

        expect(bookmark.affinity.bookmark).toBeGreaterThan(open.affinity.open * 6);
        expect(completion.affinity.completion).toBeGreaterThan(bookmark.affinity.bookmark);
    });

    it("defines removal signals as negative 60-percent reversals", () => {
        expect(EventWeight.BookmarkRemoved).toBeLessThan(0);
        expect(EventWeight.HighlightRemoved).toBeLessThan(0);
        expect(Math.abs(EventWeight.BookmarkRemoved)).toBe(EventWeight.Bookmark * 0.6);
        expect(Math.abs(EventWeight.HighlightRemoved)).toBe(EventWeight.Highlight * 0.6);
    });

    it("keeps a net-positive bookmark bias after one add/remove cycle", () => {
        const initial = applyEvent(undefined, ["tag-a"], T0);
        const before = initial.affinity["tag-a"];
        const bookmarked = applyEvent(initial, ["tag-a"], T0, EventWeight.Bookmark);
        const removed = applyEvent(bookmarked, ["tag-a"], T0, EventWeight.BookmarkRemoved);

        expect(removed.affinity["tag-a"]).toBeGreaterThan(before);
    });

    it("ignores an impression miss for an unknown tag without evicting learned interests", () => {
        // A mature profile is at the cap. Impression misses commonly include tags from
        // the serendipity leg, which have no prior affinity evidence and must not create
        // protected zero-score placeholders that displace real interests.
        const affinity: AffinityMap = {};
        for (let i = 0; i < 50; i++) affinity[`learned-${i}`] = 0.5;

        const result = applyEvent(
            { affinity, lastDecayUtc: T0 },
            ["unknown-a", "unknown-b"],
            T0,
            EventWeight.Impression,
        );

        expect(Object.keys(result.affinity)).toHaveLength(50);
        expect(result.affinity["unknown-a"]).toBeUndefined();
        expect(result.affinity["unknown-b"]).toBeUndefined();
        expect(result.affinity["learned-0"]).toBe(0.5);
    });

    it("halves a Core rank-1 score after one gradual half-life (120 days)", () => {
        const p = applyEvent(undefined, ["tag-a"], T0); // 0.04
        expect(decay(p, T0 + 120 * DAY).affinity["tag-a"]).toBeCloseTo(0.02, 5);
    });

    it("prunes negligible scores", () => {
        const p = applyEvent(undefined, ["tag-a"], T0); // 0.04
        // Five Core half-lives → 0.04 * 2^-5 = 0.00125, below the 0.01 floor.
        expect(decay(p, T0 + 600 * DAY).affinity["tag-a"]).toBeUndefined();
    });

    it("decays a rank-1 tag more slowly than a rank-8 tag over the same interval", () => {
        const affinity: AffinityMap = Object.fromEntries(
            Array.from({ length: 10 }, (_, index) => [`tag-${index + 1}`, 1 - index * 0.05]),
        );
        const decayed = decay({ affinity, lastDecayUtc: T0 }, T0 + 30 * DAY).affinity;
        const rankOneRetained = decayed["tag-1"] / affinity["tag-1"];
        const rankEightRetained = decayed["tag-8"] / affinity["tag-8"];

        expect(rankOneRetained).toBeGreaterThan(rankEightRetained);
        expect(rankOneRetained).toBeGreaterThan(rankEightRetained * 1.5);
    });

    it("orders topTags by decayed score, descending", () => {
        let p = applyEvent(undefined, ["low"], T0); // low = 0.04
        p = applyEvent(p, ["high"], T0);
        p = applyEvent(p, ["high"], T0); // high = 0.0784

        expect(topTags(p, 2, T0)).toEqual(["high", "low"]);
        expect(topTags(p, 1, T0)).toEqual(["high"]);
    });

    it("decays older interest below newer interest", () => {
        let p = applyEvent(undefined, ["old"], T0);
        p = applyEvent(p, ["old"], T0); // old = 0.0784 at T0
        // 120 days later (one Core half-life) old = 0.0392; a fresh hit on "new" = 0.04.
        p = applyEvent(p, ["new"], T0 + 120 * DAY);

        expect(topTags(p, 2, T0 + 120 * DAY)).toEqual(["new", "old"]);
    });

    it("does not mutate the input profile", () => {
        const p = applyEvent(undefined, ["tag-a"], T0);
        const before = { ...p.affinity };
        applyEvent(p, ["tag-b"], T0);
        expect(p.affinity).toEqual(before);
    });
});

describe("tierWeightForRank", () => {
    it("returns the documented retrieval weights at every tier boundary", () => {
        expect(tierWeightForRank(3)).toBe(1.0);
        expect(tierWeightForRank(4)).toBe(0.6);
        expect(tierWeightForRank(5)).toBe(0.6);
        expect(tierWeightForRank(6)).toBe(0.3);
        expect(tierWeightForRank(10)).toBe(0.3);
        expect(tierWeightForRank(11)).toBe(0.3);
    });
});

describe("readingDepthWeight", () => {
    it("returns no affinity evidence below the reading floor", () => {
        expect(readingDepthWeight(0)).toBe(0);
        expect(readingDepthWeight(19)).toBe(0);
    });

    it("starts at the ordinary open weight at the reading floor", () => {
        expect(readingDepthWeight(20)).toBe(EventWeight.Open);
        expect(readingDepthWeight(20)).toBe(0.04);
    });

    it("interpolates linearly between an open and read completion", () => {
        const depth = 60;
        const t = (depth - 20) / (100 - 20);
        const expected = EventWeight.Open + t * (EventWeight.ReadCompletion - EventWeight.Open);
        const weight = readingDepthWeight(depth);

        expect(weight).toBeCloseTo(expected);
        expect(weight).toBeGreaterThan(EventWeight.Open);
        expect(weight).toBeLessThan(EventWeight.ReadCompletion);
    });

    it("reaches completion parity at 100 percent and clamps higher depths", () => {
        expect(readingDepthWeight(100)).toBe(EventWeight.ReadCompletion);
        expect(readingDepthWeight(101)).toBe(EventWeight.ReadCompletion);
        expect(readingDepthWeight(101)).toBe(0.35);
    });
});
