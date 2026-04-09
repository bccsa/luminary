import { describe, it, expect } from "vitest";
import { filterAsync, someAsync } from "./asyncArray";

describe("filterAsync", () => {
    it("filters elements based on async predicate", async () => {
        const result = await filterAsync([1, 2, 3, 4, 5], async (v) => v % 2 === 0);
        expect(result).toEqual([2, 4]);
    });

    it("returns empty array when no elements match", async () => {
        const result = await filterAsync([1, 3, 5], async (v) => v % 2 === 0);
        expect(result).toEqual([]);
    });

    it("returns all elements when all match", async () => {
        const result = await filterAsync([2, 4, 6], async (v) => v % 2 === 0);
        expect(result).toEqual([2, 4, 6]);
    });

    it("returns empty array for empty input", async () => {
        const result = await filterAsync([], async () => true);
        expect(result).toEqual([]);
    });

    it("passes correct arguments to callback", async () => {
        const arr = ["a", "b", "c"];
        const calls: Array<[string, number, string[]]> = [];
        await filterAsync(arr, async (value, index, array) => {
            calls.push([value, index, array]);
            return true;
        });
        expect(calls).toEqual([
            ["a", 0, arr],
            ["b", 1, arr],
            ["c", 2, arr],
        ]);
    });
});

describe("someAsync", () => {
    it("returns true when at least one element matches", async () => {
        const result = await someAsync([1, 2, 3], async (v) => v === 2);
        expect(result).toBe(true);
    });

    it("returns false when no elements match", async () => {
        const result = await someAsync([1, 3, 5], async (v) => v === 2);
        expect(result).toBe(false);
    });

    it("returns false for empty array", async () => {
        const result = await someAsync([], async () => true);
        expect(result).toBe(false);
    });

    it("passes correct arguments to callback", async () => {
        const arr = [10, 20];
        const calls: Array<[number, number, number[]]> = [];
        await someAsync(arr, async (value, index, array) => {
            calls.push([value, index, array]);
            return false;
        });
        expect(calls).toEqual([
            [10, 0, arr],
            [20, 1, arr],
        ]);
    });
});
