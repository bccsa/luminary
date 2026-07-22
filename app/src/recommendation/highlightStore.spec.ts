import { describe, expect, it } from "vitest";
import {
    extractHighlightQueries,
    MAX_HIGHLIGHT_QUERIES,
} from "./highlightStore";

describe("extractHighlightQueries", () => {
    it("reads legacy and timestamped highlights, normalizes text, and prefers recent entries", () => {
        const queries = extractHighlightQueries({
            legacy: "<p><mark>  Older   saved phrase  </mark></p>",
            older: {
                html: "<p><mark>Duplicate phrase</mark><mark>Older second phrase</mark></p>",
                updatedAt: 10,
            },
            newest: {
                html: "<p><mark>Newest\nphrase</mark><mark>duplicate phrase</mark><mark>ok</mark></p>",
                updatedAt: 20,
            },
        });

        expect(queries).toEqual([
            { query: "Newest phrase", updatedAt: 20 },
            { query: "duplicate phrase", updatedAt: 20 },
            { query: "Older second phrase", updatedAt: 10 },
            { query: "Older saved phrase", updatedAt: 0 },
        ]);
    });

    it("bounds the newest distinct excerpts to protect offline FTS work", () => {
        const data = Object.fromEntries(
            Array.from({ length: MAX_HIGHLIGHT_QUERIES + 1 }, (_, index) => [
                `content-${index}`,
                {
                    html: `<mark>Highlighted phrase ${index}</mark>`,
                    updatedAt: index,
                },
            ]),
        );

        expect(extractHighlightQueries(data).map(({ query }) => query)).toEqual([
            `Highlighted phrase ${MAX_HIGHLIGHT_QUERIES}`,
            `Highlighted phrase ${MAX_HIGHLIGHT_QUERIES - 1}`,
            `Highlighted phrase ${MAX_HIGHLIGHT_QUERIES - 2}`,
            `Highlighted phrase ${MAX_HIGHLIGHT_QUERIES - 3}`,
        ]);
    });
});
