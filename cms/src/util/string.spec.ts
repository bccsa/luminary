import { describe, expect, test } from "vitest";
import { capitaliseFirstLetter, getTheFirstLetter } from "./string";

describe("string utils", () => {
    test("capitaliseFirstLetter works", () => {
        const lowerCaseString = "string With VARIOUS capitalization";

        const result = capitaliseFirstLetter(lowerCaseString);

        expect(result).toBe("String With VARIOUS capitalization");
    });

    test("getTheFirstLetter returns the first character", () => {
        expect(getTheFirstLetter("Hello")).toBe("H");
    });

    test("getTheFirstLetter returns empty string for empty input", () => {
        expect(getTheFirstLetter("")).toBe("");
    });
});
