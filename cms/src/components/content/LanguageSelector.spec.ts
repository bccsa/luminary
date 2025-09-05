import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import LanguageSelector from "./LanguageSelector.vue";
import { accessMap } from "luminary-shared";

describe("LanguageSelector.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can handle an unset language", async () => {
        const wrapper = mount(LanguageSelector, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                content: [],
                showSelector: true,
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        const items = wrapper.findAll('[data-test^="select-language-"]');
        const visibleLanguages = items.map((item) => item.text());

        expect(visibleLanguages).toContain(
            `${mockData.mockLanguageDtoEng.languageCode} ${mockData.mockLanguageDtoEng.name}`,
        );
        expect(visibleLanguages).toContain(
            `${mockData.mockLanguageDtoFra.languageCode} ${mockData.mockLanguageDtoFra.name}`,
        );
        expect(visibleLanguages).toContain(
            `${mockData.mockLanguageDtoSwa.languageCode} ${mockData.mockLanguageDtoSwa.name}`,
        );
    });

    it("can display a dropdown with all languages", async () => {
        const wrapper = mount(LanguageSelector, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                content: [],
                showSelector: true,
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        expect(wrapper.text()).toContain("English");
        expect(wrapper.text()).toContain("Français");
        expect(wrapper.text()).toContain("Swahili");
    });
});
