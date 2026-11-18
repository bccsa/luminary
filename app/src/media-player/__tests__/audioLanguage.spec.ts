import { describe, expect, it, beforeEach } from "vitest";
import { nextTick } from "vue";
import { audioLanguageFor, audioLanguagePreference } from "../audioLanguage";

const tracks = [
    { id: "a-en", lang: "en", label: "English" },
    { id: "a-fr", lang: "fr", label: "Français" },
] as never;

describe("the remembered audio language", () => {
    beforeEach(() => {
        audioLanguagePreference.value = null;
    });

    it("is used where the item has it, and the item's own language elsewhere", () => {
        expect(audioLanguageFor(tracks, "en")).toBe("en");
        audioLanguagePreference.value = "fra";
        expect(audioLanguageFor(tracks, "en")).toBe("fra");
        audioLanguagePreference.value = "sw";
        expect(audioLanguageFor(tracks, "en")).toBe("en");
    });

    it("is kept across restarts", async () => {
        audioLanguagePreference.value = "fr";
        await nextTick();
        expect(localStorage.getItem("audioLanguagePreference")).toBe("fr");
    });
});
