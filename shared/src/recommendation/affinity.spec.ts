import { describe, it, expect } from "vitest";
import { applyEvent, decay, topTags, userAffinityId } from "./affinity";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

describe("affinity scoring", () => {
    it("derives a deterministic affinity doc id", () => {
        expect(userAffinityId("user-1")).toBe("user-affinity-user-1");
    });

    it("bumps a tag's score on an event and clamps at 1", () => {
        let p = applyEvent(undefined, ["tag-a"], T0);
        expect(p.affinity["tag-a"]).toBeCloseTo(0.3, 5);

        // Repeated events in the same instant accumulate, capped at 1.
        for (let i = 0; i < 10; i++) p = applyEvent(p, ["tag-a"], T0);
        expect(p.affinity["tag-a"]).toBe(1);
    });

    it("halves a score after one half-life (30 days)", () => {
        const p = applyEvent(undefined, ["tag-a"], T0); // 0.3
        expect(decay(p, T0 + 30 * DAY).affinity["tag-a"]).toBeCloseTo(0.15, 5);
    });

    it("prunes negligible scores", () => {
        const p = applyEvent(undefined, ["tag-a"], T0); // 0.3
        // 10 half-lives → 0.3 * 2^-10 ≈ 0.0003, below the 0.01 floor.
        expect(decay(p, T0 + 300 * DAY).affinity["tag-a"]).toBeUndefined();
    });

    it("orders topTags by decayed score, descending", () => {
        let p = applyEvent(undefined, ["low"], T0); // low = 0.3
        p = applyEvent(p, ["high"], T0);
        p = applyEvent(p, ["high"], T0); // high = 0.6

        expect(topTags(p, 2, T0)).toEqual(["high", "low"]);
        expect(topTags(p, 1, T0)).toEqual(["high"]);
    });

    it("decays older interest below newer interest", () => {
        let p = applyEvent(undefined, ["old"], T0);
        p = applyEvent(p, ["old"], T0); // old = 0.6 at T0
        // 60 days later (2 half-lives) old ≈ 0.15; a single fresh hit on "new" = 0.3.
        p = applyEvent(p, ["new"], T0 + 60 * DAY);

        expect(topTags(p, 2, T0 + 60 * DAY)).toEqual(["new", "old"]);
    });

    it("does not mutate the input profile", () => {
        const p = applyEvent(undefined, ["tag-a"], T0);
        const before = { ...p.affinity };
        applyEvent(p, ["tag-b"], T0);
        expect(p.affinity).toEqual(before);
    });
});
