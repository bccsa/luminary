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
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Dropdown is hidden by default
        expect(wrapper.text()).toContain("Add translation");

        // Now simulate showing the dropdown
        const selectLanguageButton = wrapper.find('[data-test="language-selector"]');
        await selectLanguageButton.trigger("click");

        // Languages should now be visible
        // explain ^: Match elements where the attribute starts with a specific string.
        const items = wrapper.findAll('[data-test^="select-language-"]');
        const visibleLanguages = items.map((item) => item.text());

        expect(visibleLanguages).toContain("eng English");
        expect(visibleLanguages).toContain("fra Français");
        expect(visibleLanguages).toContain("swa Swahili");
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
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        const selectLanguage = wrapper.find("button[data-test='language-selector']");
        await selectLanguage.trigger("click");

        expect(wrapper.text()).toContain("Add translation");
        expect(wrapper.text()).toContain("English");
        expect(wrapper.text()).toContain("Français");
        expect(wrapper.text()).toContain("Swahili");
    });
});
