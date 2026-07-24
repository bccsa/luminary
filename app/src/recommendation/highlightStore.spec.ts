import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "luminary-shared";
import {
    extractHighlightQueries,
    loadHighlightQueriesFor,
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

describe("loadHighlightQueriesFor", () => {
    afterEach(async () => {
        await db.setLuminaryInternals("highlights", undefined);
    });

    it("returns only the requested content's own highlight(s), not other saved highlights", async () => {
        await db.setLuminaryInternals("highlights", {
            "content-this-article": {
                html: "<p><mark>This article's own highlight</mark></p>",
                updatedAt: 5,
            },
            "content-other-article": {
                html: "<p><mark>A different article's highlight</mark></p>",
                updatedAt: 10,
            },
        });

        const queries = await loadHighlightQueriesFor("content-this-article");

        expect(queries).toEqual([{ query: "This article's own highlight", updatedAt: 5 }]);
    });

    it("returns an empty array when nothing is stored, or the content id has no highlight", async () => {
        expect(await loadHighlightQueriesFor("content-none")).toEqual([]);

        await db.setLuminaryInternals("highlights", {
            "content-other-article": { html: "<mark>Something</mark>", updatedAt: 1 },
        });

        expect(await loadHighlightQueriesFor("content-this-article")).toEqual([]);
    });
});
