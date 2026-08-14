import { describe, it, expect } from "vitest";
import { matchTrackLanguage, pickAudioTrack } from "./audioTrackLanguage";

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

describe("pickAudioTrack", () => {
    const en = { language: "en", label: "English" };
    const eng = { language: "eng", label: "English" };
    const fra = { language: "fra", label: "French" };
    /** Quality tiers, as an encode without per-language audio produces. */
    const hd = { language: undefined, label: "HD" };
    const standard = { language: undefined, label: "Standard" };

    it("returns the track whose language matches", () => {
        expect(pickAudioTrack([fra, en], "en")).toBe(en);
    });

    it("matches a 3-letter track language against the app's 2-letter code", () => {
        expect(pickAudioTrack([fra, eng], "en")).toBe(eng);
    });

    it("returns null when no track matches, rather than a track", () => {
        expect(pickAudioTrack([fra], "en")).toBeNull();
    });

    it("returns null for tracks with no language at all", () => {
        // The regression: quality-tier audio groups (HD / Standard / Bandwidth
        // Saving) carry no LANGUAGE. Treating that as "no match, disable them all"
        // left the stream with no audio rendition, and playback stalled seconds in.
        expect(pickAudioTrack([hd, standard], "en")).toBeNull();
    });

    it("returns null for an empty track list", () => {
        expect(pickAudioTrack([], "en")).toBeNull();
    });

    it("returns null when the app has no language set", () => {
        expect(pickAudioTrack([en], null)).toBeNull();
    });

    it("picks the first match when several tracks share a language", () => {
        const first = { language: "en", label: "Stereo" };
        const second = { language: "en", label: "5.1" };
        expect(pickAudioTrack([first, second], "en")).toBe(first);
    });
});
