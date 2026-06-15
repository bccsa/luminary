import { describe, it, expect, beforeEach } from "vitest";
import { syncList } from "./state";
import { mergeHorizontal } from "./merge";
import { DocType } from "../../types";

describe("mergeHorizontal", () => {
    beforeEach(() => {
        // Clear syncList before each test
        syncList.value = [];
    });

    it("should merge chunks with different memberOf groups when both have eof=true", () => {
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
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
        expect(syncList.value[0].blockStart).toBe(5000); // max of 5000 and 4500
        expect(syncList.value[0].blockEnd).toBe(2500); // min of 3000 and 2500
    });

    it("should not merge chunks when eof=false", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: false,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(2);
    });

    it("should not merge when only one chunk has eof=true", () => {
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

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(2);
    });

    it("should merge multiple chunks with different memberOf groups", () => {
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
            {
                chunkType: "post",
                memberOf: ["group3"],
                blockStart: 4800,
                blockEnd: 2800,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2", "group3"]);
        expect(syncList.value[0].blockStart).toBe(5000); // max of all
        expect(syncList.value[0].blockEnd).toBe(2500); // min of all
    });

    it("should merge languages for content type documents", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "es"]);
    });

    it("should merge both memberOf and languages for content types", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group2"],
                languages: ["es"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
        expect(syncList.value[0].languages).toEqual(["en", "es"]);
    });

    it("should handle duplicate memberOf groups", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1", "group2"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2", "group3"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2", "group3"]);
    });

    it("should handle duplicate languages", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en", "es"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es", "fr"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "es", "fr"]);
    });

    it("should only merge chunks of the specified type", () => {
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
            {
                chunkType: "tag",
                memberOf: ["group3"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(2);
        expect(syncList.value.filter((c) => c.chunkType === "post")).toHaveLength(1);
        expect(syncList.value.filter((c) => c.chunkType === "tag")).toHaveLength(1);
    });

    it("should handle empty syncList", () => {
        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(0);
    });

    it("should handle single chunk in syncList", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1"]);
    });

    it("should sort merged memberOf groups", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group3"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4800,
                blockEnd: 2800,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2", "group3"]);
    });

    it("should sort merged languages", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["fr"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 4800,
                blockEnd: 2800,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "es", "fr"]);
    });

    it("should handle content types with undefined languages", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toBeUndefined();
    });

    it("should merge when one content chunk has languages and another doesn't", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en"]);
    });

    it("should update blockStart to the maximum value", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 3000,
                blockEnd: 1000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 5000,
                blockEnd: 2000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group3"],
                blockStart: 4000,
                blockEnd: 1500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].blockStart).toBe(5000);
    });

    it("should update blockEnd to the minimum value", () => {
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
                blockEnd: 1000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group3"],
                blockStart: 4800,
                blockEnd: 2000,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].blockEnd).toBe(1000);
    });

    it("should handle combined type strings like 'content:post'", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group2"],
                languages: ["es"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
    });

    it("should return correct blockStart and blockEnd after horizontal merge", () => {
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
            {
                chunkType: "post",
                memberOf: ["group3"],
                blockStart: 4800,
                blockEnd: 2800,
                eof: true,
            },
        ];

        const result = mergeHorizontal({ type: DocType.Post });

        // blockStart should be max (5000), blockEnd should be min (2500)
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(2500);
    });

    it("should return blockStart=0 and blockEnd=0 for empty syncList", () => {
        const result = mergeHorizontal({ type: DocType.Post });

        expect(result.blockStart).toBe(0);
        expect(result.blockEnd).toBe(0);
    });

    it("should return blockStart and blockEnd from single chunk when no merge occurs", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
        ];

        const result = mergeHorizontal({ type: DocType.Post });

        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(3000);
    });

    it("should return blockStart=0 and blockEnd=0 when no chunks have eof=true", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: false,
            },
        ];

        const result = mergeHorizontal({ type: DocType.Post });

        // No chunks with eof=true means no merge, empty filtered list
        expect(result.blockStart).toBe(0);
        expect(result.blockEnd).toBe(0);
    });

    it("should return correct values for content types with languages", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 6000,
                blockEnd: 4000,
                eof: true,
            },
            {
                chunkType: "content:post",
                memberOf: ["group2"],
                languages: ["es"],
                blockStart: 5500,
                blockEnd: 3500,
                eof: true,
            },
        ];

        const result = mergeHorizontal({ type: DocType.Content, subType: DocType.Post });

        expect(result.blockStart).toBe(6000);
        expect(result.blockEnd).toBe(3500);
    });

    it("should return values from filtered chunks only (ignoring non-eof chunks)", () => {
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
                blockStart: 9000,
                blockEnd: 1000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group3"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        const result = mergeHorizontal({ type: DocType.Post });

        // Should only consider chunks with eof=true
        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(2500);
    });

    it("should merge languages on deleteCmd entries with different languages", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "deleteCmd:post",
                memberOf: ["group1"],
                languages: ["fr"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.DeleteCmd, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "fr"]);
    });

    it("should dedupe and sort overlapping languages on deleteCmd entries", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:post",
                memberOf: ["group1"],
                languages: ["en", "fr"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "deleteCmd:post",
                memberOf: ["group1"],
                languages: ["fr", "de"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.DeleteCmd, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["de", "en", "fr"]);
    });

    it("should merge languages across three deleteCmd entries", () => {
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
            {
                chunkType: "deleteCmd:tag",
                memberOf: ["group1"],
                languages: ["de"],
                blockStart: 4800,
                blockEnd: 2800,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.DeleteCmd, subType: DocType.Tag });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["de", "en", "fr"]);
    });

    it("should handle deleteCmd entry without languages property gracefully", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "deleteCmd:post",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.DeleteCmd, subType: DocType.Post });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en"]);
    });

    it("should not introduce languages property on non-content deleteCmd entries without languages", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:language",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: true,
            },
            {
                chunkType: "deleteCmd:language",
                memberOf: ["group2"],
                blockStart: 4500,
                blockEnd: 2500,
                eof: true,
            },
        ];

        mergeHorizontal({ type: DocType.DeleteCmd, subType: DocType.Language });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
        expect(syncList.value[0].languages).toBeUndefined();
    });
});
