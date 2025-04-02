import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import LanguageSelector2 from "./LanguageSelector.vue";
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
        const wrapper = mount(LanguageSelector2, {
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

        expect(wrapper.text()).toContain("Add translation");
        expect(wrapper.text()).not.toContain("English");
        expect(wrapper.text()).not.toContain("French");
        expect(wrapper.text()).not.toContain("Swahili");
    });

    it("can display a dropdown with all languages", async () => {
        const wrapper = mount(LanguageSelector2, {
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
