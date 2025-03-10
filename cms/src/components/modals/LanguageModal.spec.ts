import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import LanguageModal from "./LanguageModal.vue";
import { db } from "luminary-shared";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

describe("LanguageModal.vue", () => {
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

        expect(wrapper.find("h2").text()).toBe("Select preferred content language");
    });

    it("does not render when isVisible is false", () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: false },
        });

        expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("emits close event on language click and stores the selected language", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
        });

        //@ts-expect-error -- valid code
        wrapper.vm.languages = await db.docs.toArray();

        const languageButtons = await wrapper.findAll('[data-test="switch-language-button"]');

        await languageButtons[1].trigger("click");

        expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoFra._id);

        expect(wrapper.emitted()).toHaveProperty("close");
    });


    it("should switch languages correctly", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true }
        });

        //@ts-expect-error -- valid code
        wrapper.vm.languages = await db.docs.toArray();

        const modal = await wrapper.find("[name='lModal-languages']");

        expect(modal.exists()).toBe(true);

        const languageButtons = await wrapper.findAll('[data-test="switch-language-button"]');
        expect(languageButtons.length).toBe(3);

        await languageButtons[1].trigger("click");

        expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoFra._id);

        await languageButtons[0].trigger("click");

        expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoEng._id);

        await languageButtons[2].trigger("click");

        expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoSwa._id);

    });
        

    it("emits the close event on close button click", async () => {
        const wrapper = mount(LanguageModal, {
            props: { isVisible: true },
        });

        await wrapper.findComponent({ name: "LButton" }).trigger("click");
        expect(wrapper.emitted()).toHaveProperty("close");
    });
});
