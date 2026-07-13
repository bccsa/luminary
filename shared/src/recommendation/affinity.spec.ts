import { describe, it, expect } from "vitest";
import { applyEvent, decay, EventWeight, topTags } from "./affinity";
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

    it("damps event weight as the profile tracks more topics", () => {
        // Same event, same starting score (0), but one profile already has 40
        // established topics and the other is near-empty. The broad profile should
        // move noticeably less from a single event.
        const sparse = applyEvent({ affinity: {}, lastDecayUtc: T0 }, ["new"], T0);

        const broadAffinity: AffinityMap = {};
        for (let i = 0; i < 40; i++) broadAffinity[`existing-${i}`] = 0.5;
        const broad = applyEvent({ affinity: broadAffinity, lastDecayUtc: T0 }, ["new"], T0);

        expect(broad.affinity["new"]).toBeLessThan(sparse.affinity["new"]);
    });

    it("gives high-intent events much stronger evidence than an ordinary open", () => {
        const open = applyEvent(undefined, ["open"], T0);
        const bookmark = applyEvent(undefined, ["bookmark"], T0, EventWeight.Bookmark);
        const completion = applyEvent(undefined, ["completion"], T0, EventWeight.Completion);

        expect(bookmark.affinity.bookmark).toBeGreaterThan(open.affinity.open * 6);
        expect(completion.affinity.completion).toBeGreaterThan(bookmark.affinity.bookmark);
    });

    it("halves a score after one gradual half-life (45 days)", () => {
        const p = applyEvent(undefined, ["tag-a"], T0); // 0.04
        expect(decay(p, T0 + 45 * DAY).affinity["tag-a"]).toBeCloseTo(0.02, 5);
    });

    it("prunes negligible scores", () => {
        const p = applyEvent(undefined, ["tag-a"], T0); // 0.04
        // Five half-lives → 0.04 * 2^-5 = 0.00125, below the 0.01 floor.
        expect(decay(p, T0 + 225 * DAY).affinity["tag-a"]).toBeUndefined();
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
        // 90 days later (2 half-lives) old ≈ 0.0196; a fresh hit on "new" = 0.04.
        p = applyEvent(p, ["new"], T0 + 90 * DAY);

        expect(topTags(p, 2, T0 + 90 * DAY)).toEqual(["new", "old"]);
    });

    it("does not mutate the input profile", () => {
        const p = applyEvent(undefined, ["tag-a"], T0);
        const before = { ...p.affinity };
        applyEvent(p, ["tag-b"], T0);
        expect(p.affinity).toEqual(before);
    });
});
