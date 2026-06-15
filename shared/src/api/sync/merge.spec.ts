import { describe, it, expect, beforeEach } from "vitest";
import { syncList } from "./state";
import { merge, mergeHorizontal, mergeVertical } from "./merge";
import { DocType } from "../../types";
import { OPEN_MAX, OPEN_MIN } from "./utils";

describe("merge", () => {
    beforeEach(() => {
        // Clear syncList before each test
        syncList.value = [];
    });

    it("should perform vertical merge and return result when eof is false", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        const result = merge({ type: DocType.Post, memberOf: ["group1"] });

        // Should return values from vertical merge
        expect(result.eof).toBe(false);
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(4000);

        // Should not perform horizontal merge (no merging across memberOf groups)
        expect(syncList.value).toHaveLength(1);
    });

    it("should perform both vertical and horizontal merge when eof is true", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        const result = merge({ type: DocType.Post, memberOf: ["group1"] });

        // Should perform vertical merge on group1, then horizontal merge combining groups
        expect(result.eof).toBe(true);
        // blockStart should be max (5000), blockEnd should be min (2500)
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(2500);

        // After both merges, should have single combined chunk
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
    });

    it("should use horizontal merge results for blockStart and blockEnd when eof is true", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        const result = merge({ type: DocType.Post, memberOf: ["group1"] });

        // After vertical merge on group1 only, we have one chunk with blockStart=5000, blockEnd=3000
        // Horizontal merge should combine group1 and group2
        expect(result.eof).toBe(true);
        // blockStart should be max (5000), blockEnd should be min (2500)
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(2500);
    });

    it("should handle content type with subType when eof is false", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        const result = merge({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["en"],
        });

        // Should perform vertical merge but not horizontal (eof is false)
        expect(result.eof).toBe(false);
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(4000);
    });

    it("should perform horizontal merge for content type when eof is true", () => {
        syncList.value = [
            {
                chunkType: "content:tag",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:tag",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        const result = merge({
            type: DocType.Content,
            subType: DocType.Tag,
            memberOf: ["group1"],
            languages: ["en"],
        });

        // Should merge both languages horizontally
        expect(result.eof).toBe(true);
        // blockStart should be max (5000), blockEnd should be min (2500)
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(2500);

        // Chunks should be merged into one
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "es"]);
    });

    it("should handle empty syncList", () => {
        syncList.value = [];

        const result = merge({ type: DocType.Post, memberOf: ["group1"] });

        expect(result.eof).toBe(false);
        expect(result.blockStart).toBe(0);
        expect(result.blockEnd).toBe(0);
    });

    it("should preserve eof flag from vertical merge result", () => {
        // Test with eof=false
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        let result = merge({ type: DocType.Post, memberOf: ["group1"] });
        expect(result.eof).toBe(false);

        // Test with eof=true
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 0,
                eof: true,
            },
        ];

        result = merge({ type: DocType.Post, memberOf: ["group1"] });
        expect(result.eof).toBe(true);
    });

    it("should merge multiple vertical chunks and return correct blockEnd", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 6000,
                blockEnd: 5000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
                eof: true,
            },
        ];

        const result = merge({ type: DocType.Post, memberOf: ["group1"] });

        // Should first merge all three chunks vertically
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].blockStart).toBe(6000);
        expect(syncList.value[0].blockEnd).toBe(3000);
        expect(syncList.value[0].eof).toBe(true);

        // Then attempt horizontal merge (but there's only one chunk left)
        expect(result.eof).toBe(true);
        expect(result.blockStart).toBe(6000);
        expect(result.blockEnd).toBe(3000);
    });

    it("should only perform vertical merge when no other groups have eof=true", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: false,
            },
        ];

        const result = merge({ type: DocType.Post, memberOf: ["group1"] });

        // group2 has eof=false, so it won't be included in horizontal merge
        expect(result.eof).toBe(true);
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(3000);

        // Should have 2 chunks (group1 and group2 not merged)
        expect(syncList.value).toHaveLength(2);
    });

    it("should merge languages on deleteCmd entries during horizontal merge", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:tag",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "deleteCmd:tag",
                memberOf: ["group1"],
                languages: ["fr"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        const result = merge({
            type: DocType.DeleteCmd,
            subType: DocType.Tag,
            memberOf: ["group1"],
            languages: ["en"],
        });

        expect(result.eof).toBe(true);
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "fr"]);
    });

    // --- publishDate range awareness (Part A) ---

    describe("publishDate range awareness", () => {
        it("mergeVertical does NOT merge columns with different publishDate ranges", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                    publishDateMin: 100,
                    publishDateMax: 200,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                    publishDateMin: 500,
                    publishDateMax: 1000,
                },
            ];

            // Filter by the FIRST entry's range — the second must not be considered.
            mergeVertical({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                publishDateMin: 100,
                publishDateMax: 200,
            });

            // Both entries must still exist; mergeVertical only saw the first.
            expect(syncList.value).toHaveLength(2);
        });

        it("mergeHorizontal merges two EOF entries when publishDate ranges are adjacent and unions memberOf", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                    publishDateMin: 100,
                    publishDateMax: 200,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group2"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                    publishDateMin: 201, // immediately adjacent to the first entry
                    publishDateMax: 500,
                },
            ];

            mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf.sort()).toEqual(["group1", "group2"]);
            expect(syncList.value[0].publishDateMin).toBe(100);
            expect(syncList.value[0].publishDateMax).toBe(500);
        });

        it("mergeHorizontal does NOT union memberOf when publishDate ranges are NOT adjacent-or-overlapping", () => {
            // Without the publishDate gate, the old code would silently union memberOf
            // across non-mergeable date windows. This is the regression test.
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                    publishDateMin: 100,
                    publishDateMax: 200,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group2"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                    publishDateMin: 1000, // disjoint from first
                    publishDateMax: 2000,
                },
            ];

            mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

            // Both entries must remain, and memberOf must not have been merged.
            expect(syncList.value).toHaveLength(2);
            const g1 = syncList.value.find((e) => e.memberOf.includes("group1"));
            const g2 = syncList.value.find((e) => e.memberOf.includes("group2"));
            expect(g1?.memberOf).toEqual(["group1"]);
            expect(g2?.memberOf).toEqual(["group2"]);
        });

        it("mergeHorizontal preserves legacy entries (no publishDate fields) — they resolve to OPEN range and still merge", () => {
            // Regression: legacy entries (persisted before publishDate became a sync dim)
            // must continue to merge horizontally exactly as before.
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    chunkType: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal({ type: DocType.Post });

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf.sort()).toEqual(["group1", "group2"]);
            // The merged entry now carries explicit OPEN bounds (resolved from undefined).
            expect(syncList.value[0].publishDateMin).toBe(OPEN_MIN);
            expect(syncList.value[0].publishDateMax).toBe(OPEN_MAX);
        });
    });
});
