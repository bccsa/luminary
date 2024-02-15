import { describe, expect, test } from "vitest";
import { capitalizeFirstLetter } from "./string";

describe("string utils", () => {
    test("capitalizeFirstLetter works", () => {
        const lowerCaseString = "string With VARIOUS capitalization";

        const result = capitalizeFirstLetter(lowerCaseString);

        expect(result).toBe("String With VARIOUS capitalization");
    });
});
