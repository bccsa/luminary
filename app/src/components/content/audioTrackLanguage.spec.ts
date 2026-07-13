import { describe, it, expect } from "vitest";
import { matchTrackLanguage } from "./audioTrackLanguage";

describe("matchTrackLanguage", () => {
    it("matches a 3-letter code (as Android / Chrome reports)", () => {
        expect(matchTrackLanguage("eng", "en")).toBe(true);
        expect(matchTrackLanguage("deu", "de")).toBe(true);
    });

    it("matches the alternate 3-letter code some languages have", () => {
        // A few languages have two 3-letter codes, e.g. French "fra" or "fre",
        // German "deu" or "ger". Both should match the 2-letter app code.
        expect(matchTrackLanguage("fre", "fr")).toBe(true);
        expect(matchTrackLanguage("ger", "de")).toBe(true);
    });

    it("matches a 2-letter code (as iOS Safari reports) — #1808", () => {
        expect(matchTrackLanguage("en", "en")).toBe(true);
        expect(matchTrackLanguage("fr", "fr")).toBe(true);
    });

    it("ignores a country suffix like -US on the track code", () => {
        expect(matchTrackLanguage("en-US", "en")).toBe(true);
        expect(matchTrackLanguage("pt-BR", "pt")).toBe(true);
    });

    it("ignores upper/lower case", () => {
        expect(matchTrackLanguage("ENG", "en")).toBe(true);
        expect(matchTrackLanguage("EN", "EN")).toBe(true);
    });

    it("returns false when the languages are different", () => {
        expect(matchTrackLanguage("eng", "fr")).toBe(false);
        expect(matchTrackLanguage("en", "de")).toBe(false);
    });

    it("returns false for empty or missing input", () => {
        expect(matchTrackLanguage(null, "en")).toBe(false);
        expect(matchTrackLanguage("eng", null)).toBe(false);
        expect(matchTrackLanguage(undefined, undefined)).toBe(false);
        expect(matchTrackLanguage("", "en")).toBe(false);
    });
});
