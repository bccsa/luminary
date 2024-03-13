import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import LanguageSelector from "./LanguageSelector.vue";
import { mockLanguageEng, mockLanguageFra, mockLanguageSwa, mockPost } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useLanguageStore } from "@/stores/language";
import LBadge from "@/components/common/LBadge.vue";

describe("LanguageSelector", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra, mockLanguageSwa];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays the current language", async () => {
        const wrapper = mount(LanguageSelector, {
            props: {
                parent: mockPost,
                modelValue: "swa",
            },
        });

        expect(wrapper.text()).toContain("Swahili");
        expect(wrapper.text()).not.toContain("English");
        expect(wrapper.text()).not.toContain("Français");
    });

    it("can handle an unset language", async () => {
        const wrapper = mount(LanguageSelector, {
            props: {
                post: undefined,
                modelValue: undefined,
            },
        });

        expect(wrapper.text()).toContain("Select language");
        expect(wrapper.text()).not.toContain("Swahili");
        expect(wrapper.text()).not.toContain("English");
        expect(wrapper.text()).not.toContain("Français");
    });

    it("can display a dropdown with all languages", async () => {
        const wrapper = mount(LanguageSelector, {
            props: {
                parent: mockPost,
            },
        });

        await wrapper.find("button[data-test='language-selector']").trigger("click");

        expect(wrapper.text()).toContain("English");
        expect(wrapper.text()).toContain("Français");
        expect(wrapper.text()).toContain("Add translation");
        expect(wrapper.text()).toContain("Swahili");
    });

    it("displays a label with the translation status", async () => {
        const wrapper = mount(LanguageSelector, {
            props: {
                parent: mockPost,
            },
        });

        await wrapper.find("button[data-test='language-selector']").trigger("click");

        const badge = await wrapper.findAllComponents(LBadge);
        expect(badge[0].props().variant).toBe("success"); // English content = Published
        expect(badge[1].props().variant).toBe("info"); // French content = Draft
        expect(badge[2].props().variant).toBe("default"); // Swahili = no translation yet
    });
});
