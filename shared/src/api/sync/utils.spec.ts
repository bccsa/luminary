import { describe, it, expect, beforeEach } from "vitest";
import { DocType } from "../../types";
import { syncList } from "./state";
import {
    calcChunk,
    getGroups,
    getGroupSets,
    getLanguages,
    getLanguageSets,
    getPublishDateRanges,
    filterByTypeMemberOf,
    arraysEqual,
    isRangeSubsetOf,
    mergeRanges,
    OPEN_MAX,
    OPEN_MIN,
    rangesAdjacentOrOverlap,
    resolveRange,
    subtractRanges,
} from "./utils";

describe("sync utils", () => {
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

        it("should handle multiple entries and use the earliest blockEnd", () => {
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

            const result = calcChunk({
                type: DocType.Post,
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
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 6000,
                    blockEnd: 5000,
                    eof: false,
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
                    blockStart: 5000,
                    blockEnd: 4000,
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

            // Should only consider entries with language "en"
            // After sorting by blockStart: [5000->4000, 6000->5000]
            expect(result.blockStart).toBe(4000); // blockEnd of first entry (after sorting)
            expect(result.blockEnd).toBe(6000); // blockStart of second entry
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

    describe("getLanguageSets", () => {
        it("returns empty array when type is not Content", () => {
            const result = getLanguageSets({ type: DocType.Post });
            expect(result).toEqual([]);
        });

        it("returns empty array when subType is not provided", () => {
            const result = getLanguageSets({ type: DocType.Content });
            expect(result).toEqual([]);
        });

        it("returns empty array when no matching entries", () => {
            syncList.value = [];
            const result = getLanguageSets({
                type: DocType.Content,
                subType: DocType.Post,
                languages: ["en"],
            });
            expect(result).toEqual([]);
        });

        it("returns language sets for matching content entries", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const result = getLanguageSets({
                type: DocType.Content,
                subType: DocType.Post,
                languages: ["en", "es", "fr"],
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toContain("en");
            expect(result[0]).toContain("es");
        });

        it("skips entries without languages array", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const result = getLanguageSets({
                type: DocType.Content,
                subType: DocType.Post,
                languages: ["en"],
            });

            expect(result).toEqual([]);
        });

        it("skips entries where not all languages are in options.languages", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "de"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
            ];

            const result = getLanguageSets({
                type: DocType.Content,
                subType: DocType.Post,
                languages: ["en"], // "de" is not included
            });

            expect(result).toEqual([]);
        });

        it("deduplicates identical language sets", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en", "es"],
                    blockStart: 5000,
                    blockEnd: 4000,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group2"],
                    languages: ["es", "en"],
                    blockStart: 4000,
                    blockEnd: 3000,
                },
            ];

            const result = getLanguageSets({
                type: DocType.Content,
                subType: DocType.Post,
                languages: ["en", "es"],
            });

            // Both entries have the same languages, so should deduplicate
            expect(result).toHaveLength(1);
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

    describe("OPEN_MIN / OPEN_MAX", () => {
        it("uses Number.MIN_SAFE_INTEGER / Number.MAX_SAFE_INTEGER (NOT ±Infinity)", () => {
            expect(OPEN_MIN).toBe(Number.MIN_SAFE_INTEGER);
            expect(OPEN_MAX).toBe(Number.MAX_SAFE_INTEGER);
            // Critical: sentinels must survive JSON serialization (Infinity does not).
            expect(JSON.parse(JSON.stringify(OPEN_MIN))).toBe(OPEN_MIN);
            expect(JSON.parse(JSON.stringify(OPEN_MAX))).toBe(OPEN_MAX);
        });
    });

    describe("resolveRange", () => {
        it.each([
            [undefined, undefined, OPEN_MIN, OPEN_MAX],
            [100, undefined, 100, OPEN_MAX],
            [undefined, 200, OPEN_MIN, 200],
            [100, 200, 100, 200],
        ])("resolveRange(%p, %p) -> { min: %p, max: %p }", (min, max, expMin, expMax) => {
            const r = resolveRange(min, max);
            expect(r.min).toBe(expMin);
            expect(r.max).toBe(expMax);
        });
    });

    describe("isRangeSubsetOf", () => {
        it.each<[{ min: number; max: number }, { min: number; max: number }, boolean]>([
            [{ min: 100, max: 200 }, { min: 100, max: 200 }, true], // equal
            [{ min: 110, max: 190 }, { min: 100, max: 200 }, true], // strictly inside
            [{ min: 99, max: 200 }, { min: 100, max: 200 }, false], // exceeds left
            [{ min: 100, max: 201 }, { min: 100, max: 200 }, false], // exceeds right
            [{ min: 300, max: 400 }, { min: 100, max: 200 }, false], // disjoint
            [{ min: OPEN_MIN, max: OPEN_MAX }, { min: OPEN_MIN, max: OPEN_MAX }, true], // open is subset of open
        ])("isRangeSubsetOf(%p, %p) === %p", (inner, outer, expected) => {
            expect(isRangeSubsetOf(inner, outer)).toBe(expected);
        });
    });

    describe("rangesAdjacentOrOverlap", () => {
        it.each<[{ min: number; max: number }, { min: number; max: number }, boolean]>([
            [{ min: 100, max: 200 }, { min: 150, max: 250 }, true], // overlap
            [{ min: 100, max: 200 }, { min: 200, max: 300 }, true], // touching
            [{ min: 100, max: 200 }, { min: 201, max: 300 }, true], // immediately adjacent
            [{ min: 100, max: 200 }, { min: 300, max: 400 }, false], // disjoint
            [{ min: 300, max: 400 }, { min: 100, max: 200 }, false], // disjoint reversed
            [{ min: OPEN_MIN, max: OPEN_MAX }, { min: 100, max: 200 }, true], // open spans all
            [{ min: 100, max: 100 }, { min: 100, max: 100 }, true], // singleton equal
        ])("rangesAdjacentOrOverlap(%p, %p) === %p", (a, b, expected) => {
            expect(rangesAdjacentOrOverlap(a, b)).toBe(expected);
        });
    });

    describe("mergeRanges", () => {
        it("returns the smallest range containing both inputs", () => {
            expect(mergeRanges({ min: 100, max: 200 }, { min: 150, max: 300 })).toEqual({
                min: 100,
                max: 300,
            });
        });
        it("works with open bounds", () => {
            expect(mergeRanges({ min: OPEN_MIN, max: 200 }, { min: 100, max: OPEN_MAX })).toEqual({
                min: OPEN_MIN,
                max: OPEN_MAX,
            });
        });
    });

    describe("subtractRanges", () => {
        it("returns target unchanged when nothing covers it", () => {
            expect(subtractRanges({ min: 100, max: 200 }, [])).toEqual([{ min: 100, max: 200 }]);
        });
        it("returns empty when target is fully covered by a single range", () => {
            expect(subtractRanges({ min: 100, max: 200 }, [{ min: 50, max: 300 }])).toEqual([]);
        });
        it("returns the leftover slices when target is partially covered", () => {
            expect(subtractRanges({ min: 100, max: 1000 }, [{ min: 300, max: 500 }])).toEqual([
                { min: 100, max: 299 },
                { min: 501, max: 1000 },
            ]);
        });
        it("merges overlapping/adjacent covers before subtraction", () => {
            expect(
                subtractRanges({ min: 0, max: 100 }, [
                    { min: 10, max: 30 },
                    { min: 30, max: 50 },
                    { min: 49, max: 80 },
                ]),
            ).toEqual([
                { min: 0, max: 9 },
                { min: 81, max: 100 },
            ]);
        });
        it("clips covers to the target before subtraction", () => {
            expect(
                subtractRanges({ min: 100, max: 200 }, [
                    { min: 0, max: 150 },
                    { min: 180, max: 999 },
                ]),
            ).toEqual([{ min: 151, max: 179 }]);
        });
    });

    describe("getPublishDateRanges", () => {
        it("returns empty array for empty syncList", () => {
            expect(getPublishDateRanges({ type: DocType.Content, subType: DocType.Post })).toEqual(
                [],
            );
        });

        it("returns unique resolved ranges for the given chunkType", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 1000,
                    blockEnd: 0,
                    publishDateMin: 100,
                    publishDateMax: 200,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["g2"],
                    languages: ["fr"],
                    blockStart: 1000,
                    blockEnd: 0,
                    publishDateMin: 100,
                    publishDateMax: 200,
                }, // duplicate range, different memberOf
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 1000,
                    blockEnd: 0,
                    publishDateMin: 500,
                    publishDateMax: 1000,
                },
                {
                    chunkType: "content:tag",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 1000,
                    blockEnd: 0,
                    publishDateMin: 0,
                    publishDateMax: 50,
                }, // different chunkType, must be excluded
            ];
            const ranges = getPublishDateRanges({
                type: DocType.Content,
                subType: DocType.Post,
            });
            expect(ranges).toHaveLength(2);
            expect(ranges).toContainEqual({ min: 100, max: 200 });
            expect(ranges).toContainEqual({ min: 500, max: 1000 });
        });

        it("resolves legacy entries (no publishDate fields) to the open range", () => {
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 1000,
                    blockEnd: 0,
                },
            ];
            const ranges = getPublishDateRanges({
                type: DocType.Content,
                subType: DocType.Post,
            });
            expect(ranges).toEqual([{ min: OPEN_MIN, max: OPEN_MAX }]);
        });
    });

    describe("filterByTypeMemberOf — publishDate range gating", () => {
        it("does not match entries with a different resolved publishDate range", () => {
            const narrowEntry = {
                chunkType: "content:post",
                memberOf: ["g1"],
                languages: ["en"],
                blockStart: 1000,
                blockEnd: 0,
                publishDateMin: 100,
                publishDateMax: 200,
            };
            const openOptions = {
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
            };
            // The narrow entry should NOT match an options object that leaves the range open
            // (resolving to OPEN_MIN/OPEN_MAX), because the ranges are unequal.
            expect(filterByTypeMemberOf(openOptions)(narrowEntry)).toBe(false);
        });

        it("matches a legacy entry (no publishDate fields) against open options", () => {
            const legacyEntry = {
                chunkType: "content:post",
                memberOf: ["g1"],
                languages: ["en"],
                blockStart: 1000,
                blockEnd: 0,
            };
            expect(
                filterByTypeMemberOf({
                    type: DocType.Content,
                    subType: DocType.Post,
                    memberOf: ["g1"],
                    languages: ["en"],
                })(legacyEntry),
            ).toBe(true);
        });

        it("matches when entry range equals options range exactly", () => {
            const entry = {
                chunkType: "content:post",
                memberOf: ["g1"],
                languages: ["en"],
                blockStart: 1000,
                blockEnd: 0,
                publishDateMin: 100,
                publishDateMax: 200,
            };
            expect(
                filterByTypeMemberOf({
                    type: DocType.Content,
                    subType: DocType.Post,
                    memberOf: ["g1"],
                    languages: ["en"],
                    publishDateMin: 100,
                    publishDateMax: 200,
                })(entry),
            ).toBe(true);
        });
    });
});
