import { describe, expect, it } from "vitest";
import { moreNeighbours, withSectionHeadings, type PlayerUpNextItem } from "../upNext";

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

describe("moreNeighbours", () => {
    const item = (id: string, current = false) => ({
        id,
        title: id,
        ...(current ? { current } : {}),
    });

    it("gives the items either side of what plays", () => {
        const { previous, next } = moreNeighbours([item("a"), item("b", true), item("c")]);
        expect(previous?.id).toBe("a");
        expect(next?.id).toBe("c");
    });

    it("has no previous at the top and no next at the end", () => {
        expect(moreNeighbours([item("a", true), item("b")]).previous).toBeUndefined();
        expect(moreNeighbours([item("a"), item("b", true)]).next).toBeUndefined();
    });

    it("passes over what is not on the device when only downloads play", () => {
        const items = [
            { ...item("a"), downloaded: true },
            item("b"),
            item("c", true),
            item("d"),
            { ...item("e"), downloaded: true },
        ];
        expect(moreNeighbours(items).previous?.id).toBe("b");
        const { previous, next } = moreNeighbours(items, true);
        expect(previous?.id).toBe("a");
        expect(next?.id).toBe("e");
    });

    it("starts at the top when nothing plays from the list", () => {
        const { previous, next } = moreNeighbours([item("a"), item("b")]);
        expect(previous).toBeUndefined();
        expect(next?.id).toBe("a");
    });
});
