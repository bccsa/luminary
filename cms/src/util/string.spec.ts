import { describe, expect, test } from "vitest";
import { capitaliseFirstLetter } from "./string";

describe("string utils", () => {
    test("capitaliseFirstLetter works", () => {
        const lowerCaseString = "string With VARIOUS capitalization";

        const result = capitaliseFirstLetter(lowerCaseString);

        expect(result).toBe("String With VARIOUS capitalization");
    });

    test("capitaliseFirstLetter returns empty string for undefined or empty", () => {
        expect(capitaliseFirstLetter(undefined)).toBe("");
        expect(capitaliseFirstLetter("")).toBe("");
    });
});
