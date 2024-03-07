import { describe, expect, it } from "vitest";
import { sortByName } from "./sortByName";

describe("sortByName", () => {
    it("can sort an array by name", () => {
        const array = [
            {
                id: 1,
                name: "Z",
            },
            {
                id: 2,
                name: "A",
            },
            {
                id: 3,
                name: "B",
            },
        ];

        const result = array.sort(sortByName);

        expect(result).toEqual([
            {
                id: 2,
                name: "A",
            },
            {
                id: 3,
                name: "B",
            },
            {
                id: 1,
                name: "Z",
            },
        ]);
    });
});
