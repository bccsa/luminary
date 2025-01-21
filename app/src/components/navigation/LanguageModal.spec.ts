import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import LanguageModal from "@/components/navigation/LanguageModal.vue";
import { db } from "luminary-shared";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { appLanguageIdsAsRef, initLanguage } from "@/globalConfig";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

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
        });

        expect(wrapper.find("h2").text()).toBe("Select Language");
    });

    it("does not render when isVisible is false", () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: false },
        });

        expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("stores the selected language", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
        });

        //@ts-expect-error -- valid code
        wrapper.vm.languages = await db.docs.toArray();

        const languageButtons = await wrapper.findAll('[data-test="add-language-button"]');
        await languageButtons[0].trigger("click");

        expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
    });

    it("emits the close event on close button click", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
        });

        await wrapper.findComponent({ name: "LButton" }).trigger("click");
        expect(wrapper.emitted()).toHaveProperty("close");
    });
});
