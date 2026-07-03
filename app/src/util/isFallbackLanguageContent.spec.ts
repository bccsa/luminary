import { describe, it, expect, beforeEach } from "vitest";
import { appLanguageIdsAsRef, appSyncedLanguageIdsAsRef } from "@/globalConfig";
import { isFallbackLanguageContent } from "./isFallbackLanguageContent";

describe("isFallbackLanguageContent", () => {
    beforeEach(() => {
        appSyncedLanguageIdsAsRef.value = ["lang-fr", "lang-sw"];
    });

    it("is false when the content language is one the user synced", () => {
        expect(isFallbackLanguageContent({ language: "lang-fr" })).toBe(false);
        expect(isFallbackLanguageContent({ language: "lang-sw" })).toBe(false);
    });

    it("is true when the content language is NOT synced (a fetched fallback)", () => {
        expect(isFallbackLanguageContent({ language: "lang-en" })).toBe(true);
    });

    it("flags a default still left in the PREFERRED list but not synced", () => {
        // Existing users keep the old force-appended default in `appLanguageIdsAsRef`; it is not
        // synced, so its content is still a fallback and must flag.
        appSyncedLanguageIdsAsRef.value = ["lang-fr"];
        appLanguageIdsAsRef.value = ["lang-fr", "lang-eng-default"];
        expect(isFallbackLanguageContent({ language: "lang-eng-default" })).toBe(true);
    });

    it("is false for missing/empty content or language", () => {
        expect(isFallbackLanguageContent(null)).toBe(false);
        expect(isFallbackLanguageContent(undefined)).toBe(false);
        expect(isFallbackLanguageContent({ language: "" })).toBe(false);
    });
});
