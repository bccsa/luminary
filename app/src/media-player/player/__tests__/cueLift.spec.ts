import { describe, expect, it } from "vitest";
import { liftCues, liftLine, type LiftableCue } from "../ui/cueLift";

const cue = (line: LiftableCue["line"] = "auto", snapToLines = true): LiftableCue => ({
    line,
    snapToLines,
});

describe("liftLine", () => {
    it("counts enough lines up from the bottom to clear the bar", () => {
        // One line is 5% of 400 px, 20 px: a 90 px bar takes five lines, so the cue rests on line -6.
        expect(liftLine(90, 400)).toBe(-6);
        expect(liftLine(100, 400)).toBe(-6);
        expect(liftLine(101, 400)).toBe(-7);
    });

    it("asks for nothing when there is no bar or no picture", () => {
        expect(liftLine(0, 400)).toBeNull();
        expect(liftLine(100, 0)).toBeNull();
        expect(liftLine(NaN, 400)).toBeNull();
    });

    it("stops at the top of the picture when the bar is taller than it", () => {
        expect(liftLine(500, 400)).toBe(-21);
    });
});

describe("liftCues", () => {
    it("lifts the cues the browser places itself, and puts them back as they were", () => {
        const saved = new WeakMap();
        const a = cue("auto", false);
        liftCues([a], -6, saved);
        expect(a).toEqual({ line: -6, snapToLines: true });

        liftCues([a], null, saved);
        expect(a).toEqual({ line: "auto", snapToLines: false });
    });

    it("follows the bar to a new height, and still puts the cue back where it began", () => {
        const saved = new WeakMap();
        const a = cue();
        liftCues([a], -6, saved);
        liftCues([a], -4, saved);
        expect(a.line).toBe(-4);

        liftCues([a], null, saved);
        expect(a.line).toBe("auto");
    });

    it("leaves a cue its author placed", () => {
        const saved = new WeakMap();
        const top = cue(0);
        liftCues([top], -6, saved);
        expect(top).toEqual({ line: 0, snapToLines: true });
        liftCues([top], null, saved);
        expect(top.line).toBe(0);
    });

    it("does nothing to a cue it never moved when asked to put cues back", () => {
        const a = cue();
        liftCues([a], null, new WeakMap());
        expect(a).toEqual({ line: "auto", snapToLines: true });
    });
});
