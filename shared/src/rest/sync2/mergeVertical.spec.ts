import { describe, it, expect, beforeEach } from "vitest";
import { syncList } from "./state";
import { mergeVertical } from "./merge";
import { DocType } from "../../types";

describe("mergeVertical", () => {
    beforeEach(() => {
        // Clear syncList before each test
        syncList.value = [];
    });

    it("should merge adjacent chunks with same type, memberOf, and languages", () => {
        syncList.value = [
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
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0]).toEqual({
            chunkType: "post",
            memberOf: ["group1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });
        expect(result.eof).toBe(false);
    });

    it("should merge multiple adjacent chunks into one", () => {
        syncList.value = [
            {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
            {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 6000,
                blockEnd: 5000,
                eof: false,
            },
            {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Tag, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0]).toEqual({
            chunkType: "tag",
            memberOf: ["group1"],
            blockStart: 7000,
            blockEnd: 4000,
            eof: false,
        });
    });

    it("should not be blocked by other groups while merging", () => {
        syncList.value = [
            {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
            {
                chunkType: "tag",
                memberOf: ["group2"],
                blockStart: 6000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 6000,
                blockEnd: 5000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Tag, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(2);
        expect(syncList.value[0]).toEqual({
            chunkType: "tag",
            memberOf: ["group1"],
            blockStart: 7000,
            blockEnd: 5000,
            eof: false,
        });
    });

    it("should not be blocked by other languages while merging", () => {
        syncList.value = [
            {
                chunkType: "content:tag",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
            {
                chunkType: "content:tag",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 6000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "content:tag",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 6000,
                blockEnd: 5000,
                eof: false,
            },
        ];

        mergeVertical({
            type: DocType.Content,
            subType: DocType.Tag,
            memberOf: ["group1"],
            languages: ["en"],
        });

        expect(syncList.value).toHaveLength(2);
        expect(syncList.value[0]).toEqual({
            chunkType: "content:tag",
            memberOf: ["group1"],
            languages: ["en"],
            blockStart: 7000,
            blockEnd: 5000,
            eof: false,
        });
    });

    it("should set eof flag when merging chunks with eof=true", () => {
        syncList.value = [
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
                blockEnd: 0,
                eof: true,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].eof).toBe(true);
        expect(result.eof).toBe(true);
    });

    it("should not merge chunks with different memberOf groups", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(2);
    });

    it("should not merge chunks with different languages", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["en"],
        });

        expect(syncList.value).toHaveLength(2);
    });

    it("should merge chunks with same languages", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en", "es"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en", "es"],
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["en", "es"],
        });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0]).toEqual({
            chunkType: "content:post",
            memberOf: ["group1"],
            languages: ["en", "es"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });
    });

    it("should not merge chunks with non-adjacent time ranges", () => {
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
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(2);
    });

    it("should handle chunks with blockStart=0 (no data returned)", () => {
        syncList.value = [
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
                blockStart: 0,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0]).toEqual({
            chunkType: "post",
            memberOf: ["group1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });
    });

    it("should only merge chunks of the specified type", () => {
        syncList.value = [
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
                eof: false,
            },
            {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(2);
        expect(syncList.value.filter((c) => c.chunkType === "post")).toHaveLength(1);
        expect(syncList.value.filter((c) => c.chunkType === "tag")).toHaveLength(1);
    });

    it("should handle empty syncList", () => {
        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(0);
        expect(result.eof).toBe(false);
    });

    it("should handle single chunk in syncList", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0]).toEqual({
            chunkType: "post",
            memberOf: ["group1"],
            blockStart: 5000,
            blockEnd: 4000,
            eof: false,
        });
    });

    it("should merge chunks with undefined languages", () => {
        syncList.value = [
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
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
    });

    it("should not merge when one chunk has languages and the other doesn't", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["en"],
        });

        expect(syncList.value).toHaveLength(2);
    });

    it("should merge different memberOf/languages groups independently", () => {
        // This test validates the fix for the deadlock situation
        // where different memberOf/languages combinations should be processed separately
        syncList.value = [
            // Group 1 chunks (group1)
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 6000,
                blockEnd: 5000,
                eof: false,
            },
            // Group 2 chunks (group2) - interleaved
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 6500,
                blockEnd: 5500,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 5500,
                blockEnd: 4500,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1"] });
        mergeVertical({ type: DocType.Post, memberOf: ["group2"] });

        // Should result in 2 merged chunks (one per group)
        expect(syncList.value).toHaveLength(2);

        const group1Chunk = syncList.value.find(
            (c) => c.memberOf.length === 1 && c.memberOf[0] === "group1",
        );
        const group2Chunk = syncList.value.find(
            (c) => c.memberOf.length === 1 && c.memberOf[0] === "group2",
        );

        expect(group1Chunk).toEqual({
            chunkType: "post",
            memberOf: ["group1"],
            blockStart: 7000,
            blockEnd: 5000,
            eof: false,
        });

        expect(group2Chunk).toEqual({
            chunkType: "post",
            memberOf: ["group2"],
            blockStart: 6500,
            blockEnd: 4500,
            eof: false,
        });
    });

    it("should merge different language groups independently", () => {
        syncList.value = [
            // English chunks
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 8000,
                blockEnd: 7000,
                eof: false,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
            // Spanish chunks - interleaved
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 7500,
                blockEnd: 6500,
                eof: false,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 6500,
                blockEnd: 5500,
                eof: false,
            },
        ];

        mergeVertical({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["en"],
        });
        mergeVertical({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["es"],
        });

        // Should result in 2 merged chunks (one per language)
        expect(syncList.value).toHaveLength(2);

        const enChunk = syncList.value.find(
            (c) => c.languages && c.languages.length === 1 && c.languages[0] === "en",
        );
        const esChunk = syncList.value.find(
            (c) => c.languages && c.languages.length === 1 && c.languages[0] === "es",
        );

        expect(enChunk).toEqual({
            chunkType: "content:post",
            memberOf: ["group1"],
            languages: ["en"],
            blockStart: 8000,
            blockEnd: 6000,
            eof: false,
        });

        expect(esChunk).toEqual({
            chunkType: "content:post",
            memberOf: ["group1"],
            languages: ["es"],
            blockStart: 7500,
            blockEnd: 5500,
            eof: false,
        });
    });

    it("should handle languages in different order as the same group", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en", "es"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es", "en"], // Different order, same content
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["group1"],
            languages: ["en", "es"],
        });

        // Should merge because the languages are the same, just in different order
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].blockStart).toBe(5000);
        expect(syncList.value[0].blockEnd).toBe(3000);
    });

    it("should handle memberOf in different order as the same group", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1", "group2"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group2", "group1"], // Different order, same content
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        mergeVertical({ type: DocType.Post, memberOf: ["group1", "group2"] });

        // Should merge because the memberOf groups are the same, just in different order
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].blockStart).toBe(5000);
        expect(syncList.value[0].blockEnd).toBe(3000);
    });

    it("should return eof=true when first chunk has eof=true", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].eof).toBe(false);
        expect(result.eof).toBe(true);
    });

    it("should return eof=false when first chunk has eof=false and no merged chunks have eof=true", () => {
        syncList.value = [
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
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].eof).toBe(false);
        expect(result.eof).toBe(false);
    });

    it("should return eof=true when any merged chunk has eof=true regardless of first chunk", () => {
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

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].eof).toBe(true);
        expect(result.eof).toBe(true);
    });

    it("should handle eof flag correctly with multiple groups", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: true,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        // Should not merge different groups
        expect(syncList.value).toHaveLength(2);
        // eof should be true since first filtered chunk has eof=true
        expect(result.eof).toBe(true);
    });

    it("should initialize eof from first filtered chunk when type filter excludes other chunks", () => {
        syncList.value = [
            {
                chunkType: "tag",
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
                eof: true,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        // Should only process post type
        expect(syncList.value).toHaveLength(2);
        expect(result.eof).toBe(true);
    });

    it("should return correct blockStart and blockEnd after merge", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
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
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        // Should return blockStart from newest (first) chunk and blockEnd from oldest (last) chunk
        expect(result.blockStart).toBe(7000);
        expect(result.blockEnd).toBe(4000);
    });

    it("should return blockStart=0 and blockEnd=0 for empty syncList", () => {
        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(result.blockStart).toBe(0);
        expect(result.blockEnd).toBe(0);
    });

    it("should return blockStart and blockEnd from single chunk when no merge occurs", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        expect(result.blockStart).toBe(5000);
        expect(result.blockEnd).toBe(4000);
    });

    it("should return correct blockStart and blockEnd when chunks are not merged", () => {
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
                blockStart: 4000,
                blockEnd: 3000,
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        // Non-adjacent chunks shouldn't merge, return values from first (newest) chunk
        expect(result.blockStart).toBe(6000);
        expect(result.blockEnd).toBe(5000);
    });

    it("should return correct blockStart and blockEnd from filtered chunks only", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 6000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 9000,
                blockEnd: 8000,
                eof: false,
            },
            {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 6000,
                blockEnd: 5000,
                eof: false,
            },
        ];

        const result = mergeVertical({ type: DocType.Post, memberOf: ["group1"] });

        // Should return values from group1 chunks only
        expect(result.blockStart).toBe(7000);
        expect(result.blockEnd).toBe(5000);
    });
});
