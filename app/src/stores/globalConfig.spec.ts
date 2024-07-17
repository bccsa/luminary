import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";
import { setActivePinia, storeToRefs } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";
import { db, type LanguageDto } from "luminary-shared";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";

let store: Record<string, string> = {};

const localStorageMock: Storage = {
    getItem: (key: string): string => store[key] ?? null,
    setItem: (key: string, value: string): void => {
        store[key] = value.toString();
    },
    removeItem: (key: string): void => {
        delete store[key];
    },
    clear: (): void => {
        store = {};
    },
    key: (index: number): string | null => "",
    length: Object.keys(store).length,
};

// Object.defineProperty(window, "localStorage", { value: localStorageMock });

import { useGlobalConfigStore } from "@/stores/globalConfig";
import waitForExpect from "wait-for-expect";

describe("useGlobalConfigStore", () => {
    let languagesMock: any;

    beforeEach(() => {
        languagesMock = ref([]);
        db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);

        // Mock environment variables
        import.meta.env.VITE_APP_NAME = "Test App";
        import.meta.env.VITE_API_URL = "http://api.test.com";
        import.meta.env.DEV = true;

        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        db.docs.clear();
        vi.clearAllMocks();
    });

    it("initializes with the correct environment variables", () => {
        const store = useGlobalConfigStore();

        expect(store.appName).toBe("Test App");
        expect(store.apiUrl).toBe("http://api.test.com");
        expect(store.isDevMode).toBe(true);
    });

    it("returns the preferred language from local storage", async () => {
        const store = useGlobalConfigStore();

        localStorage.setItem("language", "lang-eng");

        await waitForExpect(() => {
            expect(store.appLanguage).toEqual(mockLanguageDtoEng);
        });
    });

    it("falls back to the first available language if the preferred language is not found", () => {
        const mockLanguages: LanguageDto[] = [
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            mockLanguageDtoSwa,
        ];

        const store = useGlobalConfigStore();
        const { appLanguage } = storeToRefs(store);

        localStorageMock.value = "lang-non-existent";
        languagesMock.value = mockLanguages;

        expect(appLanguage.value).toEqual(mockLanguages[0]);
    });

    it("updates the local storage when a new language is set", () => {
        const mockLanguages: LanguageDto[] = [
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            mockLanguageDtoSwa,
        ];

        const store = useGlobalConfigStore();
        const { appLanguage } = storeToRefs(store);

        localStorageMock.value = "lang-fra";
        languagesMock.value = mockLanguages;

        expect(appLanguage.value).toBe(mockLanguages[1]);
    });
});
