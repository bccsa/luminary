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

    it("reads range-shaped highlights alongside old HTML snapshots", () => {
        const queries = extractHighlightQueries({
            ranges: {
                ranges: [
                    { start: 0, end: 12, color: "green", text: "Range phrase" },
                    { start: 20, end: 30, color: "nope", text: "Malformed entry" },
                ],
                updatedAt: 30,
            },
            snapshot: { html: "<p><mark>Snapshot phrase</mark></p>", updatedAt: 10 },
        });

        expect(queries).toEqual([
            { query: "Range phrase", updatedAt: 30 },
            { query: "Snapshot phrase", updatedAt: 10 },
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
        await db.userActivity.clear();
    });

    it("returns only the requested content's own highlight(s), not other saved highlights", async () => {
        await db.userActivity.bulkPut([
            {
                _id: "highlighted:content-this-article:0-29",
                type: "highlighted",
                parentId: "post-this",
                contentId: "content-this-article",
                updatedTimeUtc: 5,
                payload: {
                    range: {
                        start: 0,
                        end: 29,
                        color: "yellow",
                        text: "This article's own highlight",
                    },
                },
            },
            {
                _id: "highlighted:content-other-article:0-28",
                type: "highlighted",
                parentId: "post-other",
                contentId: "content-other-article",
                updatedTimeUtc: 10,
                payload: {
                    range: {
                        start: 0,
                        end: 28,
                        color: "yellow",
                        text: "A different article's highlight",
                    },
                },
            },
        ] as any);

        const queries = await loadHighlightQueriesFor("content-this-article");

        expect(queries).toEqual([{ query: "This article's own highlight", updatedAt: 5 }]);
    });

    it("returns an empty array when nothing is stored, or the content id has no highlight", async () => {
        expect(await loadHighlightQueriesFor("content-none")).toEqual([]);

        await db.userActivity.put({
            _id: "highlighted:content-other-article:0-9",
            type: "highlighted",
            parentId: "post-other",
            contentId: "content-other-article",
            updatedTimeUtc: 1,
            payload: { range: { start: 0, end: 9, color: "yellow", text: "Something" } },
        } as any);

        expect(await loadHighlightQueriesFor("content-this-article")).toEqual([]);
    });
});
