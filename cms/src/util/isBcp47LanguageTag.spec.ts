import { describe, expect, test } from "vitest";
import { isBcp47LanguageTag } from "./isBcp47LanguageTag";

describe("isBcp47LanguageTag", () => {
    test("accepts a two-letter language code", () => {
        expect(isBcp47LanguageTag("en")).toBe(true);
    });

    test("accepts a language-region tag", () => {
        expect(isBcp47LanguageTag("en-US")).toBe(true);
    });

    test("accepts a language-script-region tag", () => {
        expect(isBcp47LanguageTag("zh-Hans-CN")).toBe(true);
    });

    test("rejects an empty string", () => {
        expect(isBcp47LanguageTag("")).toBe(false);
    });

    test("rejects an invalid tag", () => {
        expect(isBcp47LanguageTag("not a valid tag")).toBe(false);
    });

    test("rejects a number", () => {
        expect(isBcp47LanguageTag(123)).toBe(false);
    });

    test("rejects null", () => {
        expect(isBcp47LanguageTag(null)).toBe(false);
    });

    test("rejects undefined", () => {
        expect(isBcp47LanguageTag(undefined)).toBe(false);
    });
});
