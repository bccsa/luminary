import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import LanguageModal from "./LanguageModal.vue";
import { db } from "luminary-shared";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { appLanguageIdsAsRef, initLanguage } from "@/globalConfig";
import { createI18n } from "vue-i18n";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

const i18n = createI18n({
    locale: "en",
    messages: {
        en: { "language.modal.title": "Select Language" },
    },
});

describe("LanguageModal.vue", () => {
    beforeAll(async () => {
        initLanguage();
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("renders correctly when visible", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
            global: {
                plugins: [i18n],
            },
        });

        expect(wrapper.find("h2").text()).toBe("Select Language");
    });

    it("does not render when isVisible is false", () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: false },
            global: {
                plugins: [i18n],
            },
        });

        expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("stores the selected language", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
            global: {
                plugins: [i18n],
            },
        });

        await waitForExpect(async () => {
            const languageButtons = await wrapper.findAll('[data-test="add-language-button"]');
            expect(languageButtons.length).toBeGreaterThan(0);
            await languageButtons[0].trigger("click");
            expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
        });
    });

    it("emits the close event on close button click", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
            global: {
                plugins: [i18n],
            },
        });

        await wrapper.findComponent({ name: "LButton" }).trigger("click");
        expect(wrapper.emitted()).toHaveProperty("close");
    });
});
