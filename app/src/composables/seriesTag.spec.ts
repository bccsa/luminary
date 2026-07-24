import { describe, expect, it } from "vitest";
import type { ContentDto } from "luminary-shared";
import { selectSeriesTag, MIN_SERIES_TAG_SIZE, MAX_SERIES_TAG_SIZE } from "./seriesTag";

describe("selectSeriesTag", () => {
    const tag = (parentTaggedDocs: (string | null | undefined)[]) =>
        ({ parentTaggedDocs }) as ContentDto;

    it("returns undefined for an empty tag list", () => {
        expect(selectSeriesTag([])).toBeUndefined();
    });

    it("skips tags below the minimum series size", () => {
        const tooSmall = tag(Array.from({ length: MIN_SERIES_TAG_SIZE - 1 }, (_, i) => `p${i}`));
        expect(selectSeriesTag([tooSmall])).toBeUndefined();
    });

    it("skips tags above the maximum series size", () => {
        const tooBig = tag(Array.from({ length: MAX_SERIES_TAG_SIZE + 1 }, (_, i) => `p${i}`));
        expect(selectSeriesTag([tooBig])).toBeUndefined();
    });

    it("picks the smallest qualifying tag among several candidates", () => {
        const broad = tag(Array.from({ length: 10 }, (_, i) => `broad-${i}`));
        const narrow = tag(Array.from({ length: 3 }, (_, i) => `narrow-${i}`));
        expect(selectSeriesTag([broad, narrow])).toBe(narrow);
    });

    it("ignores null/undefined holes when sizing a tag", () => {
        const withHoles = tag([null, "p1", undefined, "p2"]);
        // Two real ids -> exactly at MIN_SERIES_TAG_SIZE, so it still qualifies.
        expect(selectSeriesTag([withHoles])).toBe(withHoles);
    });
});
