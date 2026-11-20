import { describe, expect, it } from "vitest";
import { withSectionHeadings, type PlayerUpNextItem } from "../upNext";

const item = (id: string, section?: string): PlayerUpNextItem => ({ id, title: id, section });

describe("withSectionHeadings", () => {
    it("shows a section once, over the first item of its run", () => {
        const rows = withSectionHeadings([
            item("a", "Next"),
            item("b", "Next"),
            item("c", "Related"),
            item("d", "Related"),
        ]);
        expect(rows.map((r) => r.heading)).toEqual(["Next", null, "Related", null]);
    });

    it("starts a new run when a section comes round again", () => {
        const rows = withSectionHeadings([item("a", "A"), item("b", "B"), item("c", "A")]);
        expect(rows.map((r) => r.heading)).toEqual(["A", "B", "A"]);
    });

    it("draws no heading for items without a section", () => {
        expect(withSectionHeadings([item("a"), item("b")]).map((r) => r.heading)).toEqual([
            null,
            null,
        ]);
    });
});
