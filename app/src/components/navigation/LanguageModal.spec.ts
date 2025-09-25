import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

const LModalStub = {
    name: "LModal",
    props: ["heading", "isVisible"],
    template: `<div v-if="isVisible">
      <h2>{{ heading }}</h2>
      <slot />
      <slot name="footer" />
    </div>`,
};

describe("LanguageModal.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        // Initialize after seeding so default language exists
        await initLanguage();
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("renders correctly when visible", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
            global: { plugins: [i18n], stubs: { LModal: LModalStub } },
        });
        expect(wrapper.find("h2").text()).toBe("Select Language");
    });

    it("does not render when isVisible is false", () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: false },
            global: { plugins: [i18n], stubs: { LModal: LModalStub } },
        });
        expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("stores the selected language", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
            global: { plugins: [i18n], stubs: { LModal: LModalStub } },
        });

        // Wait for Dexie ref to populate
        await waitForExpect(() => {
            const buttons = wrapper.findAll('[data-test="add-language-button"]');
            expect(buttons.length).toBeGreaterThan(0);
        });

        const languageButtons = wrapper.findAll('[data-test="add-language-button"]');
        await languageButtons[0].trigger("click");
        expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
    });

    it("has the correct name on language buttons for prerendering services to detect", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
            global: { plugins: [i18n], stubs: { LModal: LModalStub } },
        });

        await waitForExpect(() => {
            expect(wrapper.find('[name="language-modal"]').exists()).toBe(true); // Name should not change

            const selectedLanguageButtons = wrapper.findAll('div[name="selected-language"]'); // Name should not change
            expect(selectedLanguageButtons.length).toBe(2);
            expect(selectedLanguageButtons[0].text()).toBe("English");

            const availableLanguageButtons = wrapper.findAll('div[name="available-language"]'); // Name should not change
            const names = availableLanguageButtons.map((btn) => btn.text());
            expect(availableLanguageButtons.length).toBe(1);
            expect(names).toContain("Swahili");
        });
    });
});
