import { describe, it, expect, beforeEach } from "vitest";
import { DocType } from "../../types";
import { syncList } from "./state";
import {
    calcChunk,
    getGroups,
    getGroupSets,
    getLanguages,
    filterByTypeMemberOf,
    arraysEqual,
} from "./utils";

describe("sync2 utils", () => {
    beforeEach(() => {
        // Clear syncList before each test
        syncList.value = [];
    });

    describe("calcChunk", () => {
        it("should return MAX_SAFE_INTEGER for initial sync with empty syncList", () => {
            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: true,
            });

            expect(result.blockStart).toBe(Number.MAX_SAFE_INTEGER);
            expect(result.blockEnd).toBe(0);
        });

        it("should return MAX_SAFE_INTEGER for non-initial sync with empty syncList", () => {
            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            expect(result.blockStart).toBe(Number.MAX_SAFE_INTEGER);
            expect(result.blockEnd).toBe(0);
        });

        it("should calculate next chunk from existing entry blockEnd for non-initial sync", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            expect(result.blockStart).toBe(4000);
            expect(result.blockEnd).toBe(0);
        });

        it("should apply tolerance for initial sync with existing data", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: true,
            });

            expect(result.blockStart).toBe(Number.MAX_SAFE_INTEGER);
            expect(result.blockEnd).toBe(4000); // 5000 - 1000 (tolerance)
        });

        it("should continue from the top block's bottom to fill the gap for non-initial sync", () => {
            // Two non-adjacent blocks: gap between 4100 and 4000
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4100,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            // Should continue from the top block's blockEnd (4100) down to the lower block's top (4000)
            expect(result.blockStart).toBe(4100); // blockEnd of the highest block
            expect(result.blockEnd).toBe(4000); // blockStart of the second-highest block
        });

        it("should correctly fill gap between catch-up block and pre-existing complete block (reconnect scenario)", () => {
            // Classic reconnect scenario: fully synced old block below, partial catch-up block above with a gap
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 1000,
                    blockEnd: 0,
                    eof: true, // Old complete block
                },
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 1500,
                    blockEnd: 1100,
                    eof: false, // New catch-up block with gap [1000, 1100]
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            // Should fill the gap [1000, 1100], not produce inverted range
            expect(result.blockStart).toBe(1100); // blockEnd of the catch-up block
            expect(result.blockEnd).toBe(1000); // blockStart of the old complete block
        });

        it("should filter by type and memberOf", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    chunkType: "tag",
                    memberOf: ["group1"],
                    blockStart: 4500,
                    blockEnd: 3500,
                    eof: false,
                },
                {
                    chunkType: "post",
                    memberOf: ["group2"],
                    blockStart: 4800,
                    blockEnd: 3800,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            // Should only consider the post entry with group1
            expect(result.blockStart).toBe(4000);
        });

        it("should handle single entry for non-initial sync with blockEnd of 0", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            expect(result.blockEnd).toBe(0); // Only one entry, so blockEnd is 0
        });

        it("should filter by languages when provided for content types", () => {
            // Two non-adjacent "en" blocks with a gap; "es" entry should be ignored
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 4000,
                    blockEnd: 3000,
                    eof: true,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 5500,
                    blockEnd: 4500,
                    eof: false,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 6000,
                    blockEnd: 4200,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                initialSync: false,
            });

            // Should only consider entries with language "en": [{4000,3000}, {6000,4200}]
            // Continue from top block's bottom (4200) to second-highest's top (4000)
            expect(result.blockStart).toBe(4200); // blockEnd of the highest "en" block
            expect(result.blockEnd).toBe(4000); // blockStart of the second-highest "en" block
        });

        it("should handle empty languages array", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: [],
                initialSync: false,
            });

            // Should match entries without languages property
            expect(result.blockStart).toBe(4000);
        });

        it("should ignore languages parameter when undefined", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Post,
                memberOf: ["group1"],
                initialSync: false,
            });

            // Should match entry even though it has languages, since we didn't filter by languages
            expect(result.blockStart).toBe(4000);
        });

        it("should match languages regardless of order", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["es", "en"],
                initialSync: false,
            });

            expect(result.blockStart).toBe(4000);
        });
    });

    describe("getGroups", () => {
        it("should return empty array when syncList is empty", () => {
            const groups = getGroups({ type: DocType.Post });
            expect(groups).toEqual([]);
        });

        it("should return unique groups for a single entry", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const groups = getGroups({ type: DocType.Post });
            expect(groups).toHaveLength(2);
            expect(groups).toContain("group1");
            expect(groups).toContain("group2");
        });

        it("should return unique groups across multiple entries", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "post",
                    memberOf: ["group2", "group3"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groups = getGroups({ type: DocType.Post });
            expect(groups).toHaveLength(3);
            expect(groups).toContain("group1");
            expect(groups).toContain("group2");
            expect(groups).toContain("group3");
        });

        it("should filter by type", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "tag",
                    memberOf: ["group2"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groups = getGroups({ type: DocType.Post });
            expect(groups).toEqual(["group1"]);
        });

        it("should handle duplicate groups in same entry", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1", "group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const groups = getGroups({ type: DocType.Post });
            expect(groups).toEqual(["group1"]);
        });
    });

    describe("getGroupSets", () => {
        it("should return empty array when syncList is empty", () => {
            const groupSets = getGroupSets({ type: DocType.Post, memberOf: [] });
            expect(groupSets).toEqual([]);
        });

        it("should return single group set for single entry", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const groupSets = getGroupSets({
                type: DocType.Post,
                memberOf: ["group1", "group2", "group3"],
            });
            expect(groupSets).toHaveLength(1);
            expect(groupSets[0].sort()).toEqual(["group1", "group2"]);
        });

        it("should return unique group sets", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "post",
                    memberOf: ["group2", "group1"], // Same set, different order
                    blockStart: 4000,
                    blockEnd: 3000,
                },
                {
                    chunkType: "post",
                    memberOf: ["group3"],
                    blockStart: 3000,
                    blockEnd: 2000,
                },
            ];

            const groupSets = getGroupSets({
                type: DocType.Post,
                memberOf: ["group1", "group2", "group3"],
            });
            expect(groupSets).toHaveLength(2);

            // Check that both unique sets are present
            const sortedSets = groupSets.map((set) => set.sort());
            expect(sortedSets).toContainEqual(["group1", "group2"]);
            expect(sortedSets).toContainEqual(["group3"]);
        });

        it("should filter by type", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "tag",
                    memberOf: ["group2"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groupSets = getGroupSets({ type: DocType.Post, memberOf: ["group1", "group2"] });
            expect(groupSets).toHaveLength(1);
            expect(groupSets[0]).toEqual(["group1"]);
        });

        it("should handle multiple different group sets", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 6000,
                    blockEnd: 5000,
                },
                {
                    chunkType: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "post",
                    memberOf: ["group2", "group3"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groupSets = getGroupSets({
                type: DocType.Post,
                memberOf: ["group1", "group2", "group3"],
            });
            expect(groupSets).toHaveLength(3);
        });
    });

    describe("getLanguages", () => {
        it("should return empty array when syncList is empty", () => {
            const languages = getLanguages();
            expect(languages).toEqual([]);
        });

        it("should return empty array when no content entries exist", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const languages = getLanguages();
            expect(languages).toEqual([]);
        });

        it("should return languages from content entries", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const languages = getLanguages();
            expect(languages).toHaveLength(2);
            expect(languages).toContain("en");
            expect(languages).toContain("es");
        });

        it("should return unique languages across multiple entries", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "content:tag",
                    memberOf: ["group1"],
                    languages: ["es", "fr"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const languages = getLanguages();
            expect(languages).toHaveLength(3);
            expect(languages).toContain("en");
            expect(languages).toContain("es");
            expect(languages).toContain("fr");
        });

        it("should handle entries without languages property", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const languages = getLanguages();
            expect(languages).toEqual([]);
        });

        it("should ignore non-content entries", () => {
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    languages: ["en"], // This should be ignored
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const languages = getLanguages();
            expect(languages).toEqual(["es"]);
        });
    });

    describe("filterByTypeMemberOf", () => {
        it("should filter entries by type and memberOf", () => {
            const entry1 = {
                chunkType: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
            };
            const entry2 = {
                chunkType: "tag",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
            };
            const entry3 = {
                chunkType: "post",
                memberOf: ["group2"],
                blockStart: 3000,
                blockEnd: 2000,
            };

            const filter = filterByTypeMemberOf({ type: DocType.Post, memberOf: ["group1"] });

            expect(filter(entry1)).toBe(true);
            expect(filter(entry2)).toBe(false);
            expect(filter(entry3)).toBe(false);
        });

        it("should match memberOf arrays regardless of order", () => {
            const entry = {
                chunkType: "post",
                memberOf: ["group2", "group1"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({
                type: DocType.Post,
                memberOf: ["group1", "group2"],
            });

            expect(filter(entry)).toBe(true);
        });

        it("should not match different memberOf arrays", () => {
            const entry = {
                chunkType: "post",
                memberOf: ["group1", "group2"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({ type: DocType.Post, memberOf: ["group1"] });

            expect(filter(entry)).toBe(false);
        });

        it("should filter by languages when provided", () => {
            const entry1 = {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
            };
            const entry2 = {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 4000,
                blockEnd: 3000,
            };

            const filter = filterByTypeMemberOf({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
            });

            expect(filter(entry1)).toBe(true);
            expect(filter(entry2)).toBe(false);
        });

        it("should match languages regardless of order", () => {
            const entry = {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["es", "en"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en", "es"],
            });

            expect(filter(entry)).toBe(true);
        });

        it("should match entries without languages when languages is empty array", () => {
            const entry = {
                chunkType: "content:post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: [],
            });

            expect(filter(entry)).toBe(true);
        });

        it("should not filter by languages when languages is undefined", () => {
            const entry1 = {
                chunkType: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
            };
            const entry2 = {
                chunkType: "content:post",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
            };

            const filter = filterByTypeMemberOf({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
            });

            expect(filter(entry1)).toBe(true);
            expect(filter(entry2)).toBe(true);
        });
    });

    describe("arraysEqual", () => {
        it("should return true for empty arrays", () => {
            expect(arraysEqual([], [])).toBe(true);
        });

        it("should return true for identical arrays", () => {
            expect(arraysEqual(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
        });

        it("should return true for arrays with same elements in different order", () => {
            expect(arraysEqual(["a", "b", "c"], ["c", "b", "a"])).toBe(true);
            expect(arraysEqual(["group1", "group2"], ["group2", "group1"])).toBe(true);
        });

        it("should return false for arrays with different elements", () => {
            expect(arraysEqual(["a", "b"], ["a", "c"])).toBe(false);
        });

        it("should return false for arrays with different lengths", () => {
            expect(arraysEqual(["a", "b"], ["a", "b", "c"])).toBe(false);
            expect(arraysEqual(["a", "b", "c"], ["a", "b"])).toBe(false);
        });

        it("should return false for one empty and one non-empty array", () => {
            expect(arraysEqual([], ["a"])).toBe(false);
            expect(arraysEqual(["a"], [])).toBe(false);
        });

        it("should handle duplicate elements correctly", () => {
            expect(arraysEqual(["a", "a"], ["a", "a"])).toBe(true);
            expect(arraysEqual(["a", "a"], ["a"])).toBe(false);
        });

        it("should return true for single element arrays", () => {
            expect(arraysEqual(["a"], ["a"])).toBe(true);
        });

        it("should return false for different single element arrays", () => {
            expect(arraysEqual(["a"], ["b"])).toBe(false);
        });
    });
});
