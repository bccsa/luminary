import { describe, it, expect, beforeEach } from "vitest";
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
                type: "post",
                memberOf: ["group1"],
                initialSync: true,
            });

            expect(result.blockStart).toBe(Number.MAX_SAFE_INTEGER);
            expect(result.blockEnd).toBe(0);
        });

        it("should return MAX_SAFE_INTEGER for non-initial sync with empty syncList", () => {
            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: false,
            });

            expect(result.blockStart).toBe(Number.MAX_SAFE_INTEGER);
            expect(result.blockEnd).toBe(0);
        });

        it("should calculate next chunk from existing entry blockEnd for non-initial sync", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: false,
            });

            expect(result.blockStart).toBe(4000);
            expect(result.blockEnd).toBe(0);
        });

        it("should apply tolerance for initial sync with existing data", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: true,
            });

            expect(result.blockStart).toBe(Number.MAX_SAFE_INTEGER);
            expect(result.blockEnd).toBe(4000); // 5000 - 1000 (tolerance)
        });

        it("should handle multiple entries and use the earliest blockEnd", () => {
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

            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: false,
            });

            // After sorting by blockStart: [4000->3000, 5000->4000]
            expect(result.blockStart).toBe(3000); // blockEnd of first entry (after sorting)
            expect(result.blockEnd).toBe(5000); // blockStart of second entry
        });

        it("should filter by type and memberOf", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
                {
                    type: "tag",
                    memberOf: ["group1"],
                    blockStart: 4500,
                    blockEnd: 3500,
                    eof: false,
                },
                {
                    type: "post",
                    memberOf: ["group2"],
                    blockStart: 4800,
                    blockEnd: 3800,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: false,
            });

            // Should only consider the post entry with group1
            expect(result.blockStart).toBe(4000);
        });

        it("should handle single entry for non-initial sync with blockEnd of 0", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: false,
            });

            expect(result.blockEnd).toBe(0); // Only one entry, so blockEnd is 0
        });

        it("should filter by languages when provided for content types", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["es"],
                    blockStart: 5500,
                    blockEnd: 4500,
                    eof: false,
                },
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                initialSync: false,
            });

            // Should only consider entries with language "en"
            // After sorting by blockStart: [5000->4000, 6000->5000]
            expect(result.blockStart).toBe(4000); // blockEnd of first entry (after sorting)
            expect(result.blockEnd).toBe(6000); // blockStart of second entry
        });

        it("should handle empty languages array", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "content:post",
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
                    type: "post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "post",
                memberOf: ["group1"],
                initialSync: false,
            });

            // Should match entry even though it has languages, since we didn't filter by languages
            expect(result.blockStart).toBe(4000);
        });

        it("should match languages regardless of order", () => {
            syncList.value = [
                {
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: false,
                },
            ];

            const result = calcChunk({
                type: "content:post",
                memberOf: ["group1"],
                languages: ["es", "en"],
                initialSync: false,
            });

            expect(result.blockStart).toBe(4000);
        });
    });

    describe("getGroups", () => {
        it("should return empty array when syncList is empty", () => {
            const groups = getGroups({ type: "post" });
            expect(groups).toEqual([]);
        });

        it("should return unique groups for a single entry", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const groups = getGroups({ type: "post" });
            expect(groups).toHaveLength(2);
            expect(groups).toContain("group1");
            expect(groups).toContain("group2");
        });

        it("should return unique groups across multiple entries", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "post",
                    memberOf: ["group2", "group3"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groups = getGroups({ type: "post" });
            expect(groups).toHaveLength(3);
            expect(groups).toContain("group1");
            expect(groups).toContain("group2");
            expect(groups).toContain("group3");
        });

        it("should filter by type", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "tag",
                    memberOf: ["group2"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groups = getGroups({ type: "post" });
            expect(groups).toEqual(["group1"]);
        });

        it("should handle duplicate groups in same entry", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const groups = getGroups({ type: "post" });
            expect(groups).toEqual(["group1"]);
        });
    });

    describe("getGroupSets", () => {
        it("should return empty array when syncList is empty", () => {
            const groupSets = getGroupSets({ type: "post" });
            expect(groupSets).toEqual([]);
        });

        it("should return single group set for single entry", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const groupSets = getGroupSets({ type: "post" });
            expect(groupSets).toHaveLength(1);
            expect(groupSets[0].sort()).toEqual(["group1", "group2"]);
        });

        it("should return unique group sets", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "post",
                    memberOf: ["group2", "group1"], // Same set, different order
                    blockStart: 4000,
                    blockEnd: 3000,
                },
                {
                    type: "post",
                    memberOf: ["group3"],
                    blockStart: 3000,
                    blockEnd: 2000,
                },
            ];

            const groupSets = getGroupSets({ type: "post" });
            expect(groupSets).toHaveLength(2);

            // Check that both unique sets are present
            const sortedSets = groupSets.map((set) => set.sort());
            expect(sortedSets).toContainEqual(["group1", "group2"]);
            expect(sortedSets).toContainEqual(["group3"]);
        });

        it("should filter by type", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "tag",
                    memberOf: ["group2"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groupSets = getGroupSets({ type: "post" });
            expect(groupSets).toHaveLength(1);
            expect(groupSets[0]).toEqual(["group1"]);
        });

        it("should handle multiple different group sets", () => {
            syncList.value = [
                {
                    type: "post",
                    memberOf: ["group1"],
                    blockStart: 6000,
                    blockEnd: 5000,
                },
                {
                    type: "post",
                    memberOf: ["group1", "group2"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "post",
                    memberOf: ["group2", "group3"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const groupSets = getGroupSets({ type: "post" });
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
                    type: "post",
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
                    type: "content:post",
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
                    type: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "content:tag",
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
                    type: "content:post",
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
                    type: "post",
                    memberOf: ["group1"],
                    languages: ["en"], // This should be ignored
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    type: "content:post",
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
                type: "post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
            };
            const entry2 = {
                type: "tag",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
            };
            const entry3 = {
                type: "post",
                memberOf: ["group2"],
                blockStart: 3000,
                blockEnd: 2000,
            };

            const filter = filterByTypeMemberOf({ type: "post", memberOf: ["group1"] });

            expect(filter(entry1)).toBe(true);
            expect(filter(entry2)).toBe(false);
            expect(filter(entry3)).toBe(false);
        });

        it("should match memberOf arrays regardless of order", () => {
            const entry = {
                type: "post",
                memberOf: ["group2", "group1"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({ type: "post", memberOf: ["group1", "group2"] });

            expect(filter(entry)).toBe(true);
        });

        it("should not match different memberOf arrays", () => {
            const entry = {
                type: "post",
                memberOf: ["group1", "group2"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({ type: "post", memberOf: ["group1"] });

            expect(filter(entry)).toBe(false);
        });

        it("should filter by languages when provided", () => {
            const entry1 = {
                type: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
            };
            const entry2 = {
                type: "content:post",
                memberOf: ["group1"],
                languages: ["es"],
                blockStart: 4000,
                blockEnd: 3000,
            };

            const filter = filterByTypeMemberOf({
                type: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
            });

            expect(filter(entry1)).toBe(true);
            expect(filter(entry2)).toBe(false);
        });

        it("should match languages regardless of order", () => {
            const entry = {
                type: "content:post",
                memberOf: ["group1"],
                languages: ["es", "en"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({
                type: "content:post",
                memberOf: ["group1"],
                languages: ["en", "es"],
            });

            expect(filter(entry)).toBe(true);
        });

        it("should match entries without languages when languages is empty array", () => {
            const entry = {
                type: "content:post",
                memberOf: ["group1"],
                blockStart: 5000,
                blockEnd: 4000,
            };

            const filter = filterByTypeMemberOf({
                type: "content:post",
                memberOf: ["group1"],
                languages: [],
            });

            expect(filter(entry)).toBe(true);
        });

        it("should not filter by languages when languages is undefined", () => {
            const entry1 = {
                type: "content:post",
                memberOf: ["group1"],
                languages: ["en"],
                blockStart: 5000,
                blockEnd: 4000,
            };
            const entry2 = {
                type: "content:post",
                memberOf: ["group1"],
                blockStart: 4000,
                blockEnd: 3000,
            };

            const filter = filterByTypeMemberOf({
                type: "content:post",
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
