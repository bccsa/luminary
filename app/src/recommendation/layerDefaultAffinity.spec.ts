import { describe, it, expect } from "vitest";
import { layerDefaultAffinity } from "./layerDefaultAffinity";

describe("layerDefaultAffinity", () => {
    it("uses the default as-is when the user has no evidence", () => {
        expect(layerDefaultAffinity({}, { a: 0.8 })).toEqual({ a: 0.8 });
    });

    it("returns the user's profile when there is no default", () => {
        const user = { a: 0.01 };
        expect(layerDefaultAffinity(user, undefined)).toBe(user);
    });

    it("keeps user scores and ranks default-only tags below the weakest user tag", () => {
        const layered = layerDefaultAffinity(
            { u1: 0.01, u2: 0.004 },
            { d1: 0.9, d2: 0.45, u1: 0.9 },
        );

        expect(layered.u1).toBe(0.01);
        expect(layered.u2).toBe(0.004);
        expect(layered.d1).toBeCloseTo(0.002, 10);
        expect(layered.d2).toBeCloseTo(0.001, 10);
        expect(layered.d1).toBeLessThan(layered.u2);
    });
});
