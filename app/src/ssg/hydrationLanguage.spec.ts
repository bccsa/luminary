import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import {
    appLanguageIdsAsRef,
    appSyncedLanguageIdsAsRef,
    resumeLanguagePersistence,
} from "@/globalConfig";
import { applyServedLanguage } from "./hydrationLanguage";

// The restore is scheduled on a macrotask so it lands after `app.mount`.
const afterHydration = () => new Promise((resolve) => setTimeout(resolve, 0));

const storedLanguages = () => localStorage.getItem("languages");

describe("applyServedLanguage", () => {
    beforeEach(async () => {
        resumeLanguagePersistence();
        appLanguageIdsAsRef.value = [];
        appSyncedLanguageIdsAsRef.value = [];
        await flushPromises();
        localStorage.clear();
    });

    it("adopts the served language when the visitor has no stored preference", async () => {
        applyServedLanguage("lang-fra");

        expect(appLanguageIdsAsRef.value).toEqual(["lang-fra"]);

        await afterHydration();
        await flushPromises();
        expect(appLanguageIdsAsRef.value).toEqual(["lang-fra"]);
    });

    it("does not persist the served language", async () => {
        applyServedLanguage("lang-fra");
        await flushPromises();

        expect(storedLanguages()).toBeNull();
    });

    it("renders in the served language, then restores an explicit stored preference", async () => {
        localStorage.setItem("languages", JSON.stringify(["lang-swa"]));
        localStorage.setItem("syncedLanguages", JSON.stringify(["lang-swa"]));
        appLanguageIdsAsRef.value = ["lang-swa"];
        appSyncedLanguageIdsAsRef.value = ["lang-swa"];
        await flushPromises();

        applyServedLanguage("lang-fra");

        // Hydration parity: the first client render must match the prerendered HTML.
        expect(appLanguageIdsAsRef.value).toEqual(["lang-fra"]);

        await afterHydration();
        await flushPromises();
        expect(appLanguageIdsAsRef.value).toEqual(["lang-swa"]);
        expect(appSyncedLanguageIdsAsRef.value).toEqual(["lang-swa"]);
        expect(storedLanguages()).toEqual(JSON.stringify(["lang-swa"]));
    });

    it("leaves a stored preference alone when the page carries no render language", async () => {
        localStorage.setItem("languages", JSON.stringify(["lang-swa"]));
        appLanguageIdsAsRef.value = ["lang-swa"];
        await flushPromises();

        applyServedLanguage("");

        expect(appLanguageIdsAsRef.value).toEqual(["lang-swa"]);

        await afterHydration();
        await flushPromises();
        expect(appLanguageIdsAsRef.value).toEqual(["lang-swa"]);
        expect(storedLanguages()).toEqual(JSON.stringify(["lang-swa"]));
    });

    it("persists again once the visitor commits an explicit selection", async () => {
        applyServedLanguage("lang-fra");
        await flushPromises();
        expect(storedLanguages()).toBeNull();

        // What LanguageModal's save() does.
        resumeLanguagePersistence();
        appLanguageIdsAsRef.value = ["lang-swa"];
        await flushPromises();

        expect(storedLanguages()).toEqual(JSON.stringify(["lang-swa"]));
    });
});
