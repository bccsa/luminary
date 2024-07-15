import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import LanguageSelector from "@/components/content/LanguageModal.vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { db } from "luminary-shared";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";

describe("LanguageSelector.vue", () => {
    beforeEach(() => {
        db.whereTypeAsRef = vi
            .fn()
            .mockReturnValue([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
    });

    it("renders correctly when visible", () => {
        const wrapper = mount(LanguageSelector, {
            props: { isVisible: true },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        expect(wrapper.find("h2").text()).toBe("Select Language");
        expect(wrapper.findAll("li").length).toBe(3);
        expect(wrapper.findAll("li").at(0)?.text()).toBe("English");
        expect(wrapper.findAll("li").at(1)?.text()).toBe("Français");
        expect(wrapper.findAll("li").at(2)?.text()).toBe("Swahili");
    });

    it("emits close event on language click", async () => {
        const wrapper = mount(LanguageSelector, {
            props: { isVisible: true },
            global: {
                plugins: [createTestingPinia()],
            },
        });
        const store = useGlobalConfigStore();

        await wrapper.findAll("li").at(0)?.trigger("click");
        expect(store.appLanguage).toEqual(mockLanguageDtoEng);
        expect(wrapper.emitted()).toHaveProperty("close");
    });

    it("emits close event on button click", async () => {
        const wrapper = mount(LanguageSelector, {
            props: { isVisible: true },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        await wrapper.findComponent({ name: "LButton" }).trigger("click");
        expect(wrapper.emitted()).toHaveProperty("close");
    });

    it("does not render when isVisible is false", () => {
        const wrapper = mount(LanguageSelector, {
            props: { isVisible: false },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        expect(wrapper.find("h2").exists()).toBe(false);
    });
});
