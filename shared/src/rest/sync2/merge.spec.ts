import { describe, it, expect, beforeEach } from "vitest";
import { syncList } from "./state";
import { mergeVertical, mergeHorizontal } from "./merge";
import { DocType } from "../../types";

describe("sync2 merge", () => {
    beforeEach(() => {
        // Clear syncList before each test
        syncList.value = [];
    });

    describe("mergeVertical", () => {
        it("should merge adjacent chunks with same type, memberOf, and languages", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            const result = mergeVertical("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0]).toEqual({
                type: "post",
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
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 7000,
                    blockEnd: 6000,
                    eof: false,
                },
                {
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
                },
                {
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            mergeVertical("tag");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0]).toEqual({
                type: "tag",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 4000,
                eof: false,
            });
        });

        it("should not be blocked by other groups while merging", () => {
            syncList.value = [
                {
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 7000,
                    blockEnd: 6000,
                    eof: false,
                },
                {
                    type: "tag",
                    memberOf: ["group2"],
                    blockStart: 6000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
                },
            ];

            mergeVertical("tag");

            expect(syncList.value).toHaveLength(2);
            expect(syncList.value[0]).toEqual({
                type: "tag",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 5000,
                eof: false,
            });
        });

        it("should not be blocked by other languages while merging", () => {
            syncList.value = [
                {
                    type: "content:tag",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 7000,
                    blockEnd: 6000,
                    eof: false,
                },
                {
                    type: "content:tag",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 6000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "content:tag",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
                },
            ];

            mergeVertical("content:tag");

            expect(syncList.value).toHaveLength(2);
            expect(syncList.value[0]).toEqual({
                type: "content:tag",
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
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 0,
                    eof: true,
                },
            ];

            const result = mergeVertical("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].eof).toBe(true);
            expect(result.eof).toBe(true);
        });

        it("should not merge chunks with different memberOf groups", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            expect(syncList.value).toHaveLength(2);
        });

        it("should not merge chunks with different languages", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("content:post");

            expect(syncList.value).toHaveLength(2);
        });

        it("should merge chunks with same languages", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("content:post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0]).toEqual({
                type: "content:post",
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
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            expect(syncList.value).toHaveLength(2);
        });

        it("should handle chunks with blockStart=0 (no data returned)", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 0,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0]).toEqual({
                type: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 3000,
                eof: false,
            });
        });

        it("should only merge chunks of the specified type", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
                {
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            expect(syncList.value).toHaveLength(2);
            expect(syncList.value.filter((c) => c.type === "post")).toHaveLength(1);
            expect(syncList.value.filter((c) => c.type === "tag")).toHaveLength(1);
        });

        it("should handle empty syncList", () => {
            const result = mergeVertical("post");

            expect(syncList.value).toHaveLength(0);
            expect(result.eof).toBe(false);
        });

        it("should handle single chunk in syncList", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0]).toEqual({
                type: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
                eof: false,
            });
        });

        it("should merge chunks with undefined languages", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            expect(syncList.value).toHaveLength(1);
        });

        it("should not merge when one chunk has languages and the other doesn't", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("content:post");

            expect(syncList.value).toHaveLength(2);
        });

        it("should merge different memberOf/languages groups independently", () => {
            // This test validates the fix for the deadlock situation
            // where different memberOf/languages combinations should be processed separately
            syncList.value = [
                // Group 1 chunks (group1)
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 7000,
                    blockEnd: 6000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
                },
                // Group 2 chunks (group2) - interleaved
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 6500,
                    blockEnd: 5500,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 5500,
                    blockEnd: 4500,
                    eof: false,
                },
            ];

            mergeVertical("post");

            // Should result in 2 merged chunks (one per group)
            expect(syncList.value).toHaveLength(2);

            const group1Chunk = syncList.value.find(
                (c) => c.memberOf.length === 1 && c.memberOf[0] === "group1",
            );
            const group2Chunk = syncList.value.find(
                (c) => c.memberOf.length === 1 && c.memberOf[0] === "group2",
            );

            expect(group1Chunk).toEqual({
                type: "post",
                memberOf: ["group1"],
                blockStart: 7000,
                blockEnd: 5000,
                eof: false,
            });

            expect(group2Chunk).toEqual({
                type: "post",
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
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 8000,
                    blockEnd: 7000,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 7000,
                    blockEnd: 6000,
                    eof: false,
                },
                // Spanish chunks - interleaved
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 7500,
                    blockEnd: 6500,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 6500,
                    blockEnd: 5500,
                    eof: false,
                },
            ];

            mergeVertical("content:post");

            // Should result in 2 merged chunks (one per language)
            expect(syncList.value).toHaveLength(2);

            const enChunk = syncList.value.find(
                (c) => c.languages && c.languages.length === 1 && c.languages[0] === "en",
            );
            const esChunk = syncList.value.find(
                (c) => c.languages && c.languages.length === 1 && c.languages[0] === "es",
            );

            expect(enChunk).toEqual({
                type: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 8000,
                blockEnd: 6000,
                eof: false,
            });

            expect(esChunk).toEqual({
                type: "content:post",
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
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["es", "en"], // Different order, same content
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("content:post");

            // Should merge because the languages are the same, just in different order
            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].blockStart).toBe(5000);
            expect(syncList.value[0].blockEnd).toBe(3000);
        });

        it("should handle memberOf in different order as the same group", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group2", "group1"], // Different order, same content
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: false,
                },
            ];

            mergeVertical("post");

            // Should merge because the memberOf groups are the same, just in different order
            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].blockStart).toBe(5000);
            expect(syncList.value[0].blockEnd).toBe(3000);
        });
    });

    describe("mergeHorizontal", () => {
        it("should merge chunks with different memberOf groups when both have eof=true", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
            expect(syncList.value[0].blockStart).toBe(5000); // max of 5000 and 4500
            expect(syncList.value[0].blockEnd).toBe(2500); // min of 3000 and 2500
        });

        it("should not merge chunks when eof=false", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: false,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(2);
        });

        it("should not merge when only one chunk has eof=true", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: false,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(2);
        });

        it("should merge multiple chunks with different memberOf groups", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group3"],
                    blockStart: 4800,
                    blockEnd: 2800,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1", "group2", "group3"]);
            expect(syncList.value[0].blockStart).toBe(5000); // max of all
            expect(syncList.value[0].blockEnd).toBe(2500); // min of all
        });

        it("should merge languages for content type documents", () => {
            syncList.value = [
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal(DocType.Content);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].languages).toEqual(["en", "es"]);
        });

        it("should merge both memberOf and languages for content types", () => {
            syncList.value = [
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group2"],
                    languages: ["es"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal(DocType.Content);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
            expect(syncList.value[0].languages).toEqual(["en", "es"]);
        });

        it("should handle duplicate memberOf groups", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2", "group3"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1", "group2", "group3"]);
        });

        it("should handle duplicate languages", () => {
            syncList.value = [
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["es", "fr"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal(DocType.Content);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].languages).toEqual(["en", "es", "fr"]);
        });

        it("should only merge chunks of the specified type", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
                {
                    type: "tag",
                    memberOf: ["group3"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(2);
            expect(syncList.value.filter((c) => c.type === "post")).toHaveLength(1);
            expect(syncList.value.filter((c) => c.type === "tag")).toHaveLength(1);
        });

        it("should handle empty syncList", () => {
            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(0);
        });

        it("should handle single chunk in syncList", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1"]);
        });

        it("should sort merged memberOf groups", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group3"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4800,
                    blockEnd: 2800,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1", "group2", "group3"]);
        });

        it("should sort merged languages", () => {
            syncList.value = [
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["fr"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 4800,
                    blockEnd: 2800,
                    eof: true,
                },
            ];

            mergeHorizontal(DocType.Content);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].languages).toEqual(["en", "es", "fr"]);
        });

        it("should handle content types with undefined languages", () => {
            syncList.value = [
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal(DocType.Content);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].languages).toEqual([]);
        });

        it("should merge when one content chunk has languages and another doesn't", () => {
            syncList.value = [
                {
                    type: DocType.Content,
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: DocType.Content,
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal(DocType.Content);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].languages).toEqual(["en"]);
        });

        it("should update blockStart to the maximum value", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 3000,
                    blockEnd: 1000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 5000,
                    blockEnd: 2000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group3"],
                    blockStart: 4000,
                    blockEnd: 1500,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].blockStart).toBe(5000);
        });

        it("should update blockEnd to the minimum value", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4500,
                    blockEnd: 1000,
                    eof: true,
                },
                {
                    type: "post",
                    memberOf: ["group3"],
                    blockStart: 4800,
                    blockEnd: 2000,
                    eof: true,
                },
            ];

            mergeHorizontal("post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].blockEnd).toBe(1000);
        });

        it("should handle combined type strings like 'content:post'", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    type: "content:post",
                    memberOf: ["group2"],
                    languages: ["es"],
                    blockStart: 4500,
                    blockEnd: 2500,
                    eof: true,
                },
            ];

            mergeHorizontal("content:post");

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].memberOf).toEqual(["group1", "group2"]);
        });
    });
});
