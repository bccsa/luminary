import { mount } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import ReaderSettingsModal from "./ReaderSettingsModal.vue";
import LButton from "../button/LButton.vue";
import { mockLanguageDtoEng } from "@/tests/mockdata";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("ReaderSettingsModal.vue", () => {
    it("shows the reader settings with a sample text preview", async () => {
        const wrapper = mount(ReaderSettingsModal, { props: { isVisible: true } });

        expect(wrapper.html()).toContain("Text &amp; font");
        expect(wrapper.find("[data-test='readerSettings']").exists()).toBe(true);
        expect(wrapper.find("[data-test='readerPreview']").text()).toContain(
            "The quick brown fox jumps over the lazy dog.",
        );
        expect(wrapper.find("[data-test='textSizeSlider']").exists()).toBe(true);
        expect(wrapper.findAll("[data-test='lineHeightOption']")).toHaveLength(3);
        expect(wrapper.find("[data-test='fontSelect']").exists()).toBe(true);
    });

    it("does not render when not visible", () => {
        const wrapper = mount(ReaderSettingsModal, { props: { isVisible: false } });

        expect(wrapper.find("[data-test='readerSettings']").exists()).toBe(false);
    });

    it("emits close when the close button is clicked", async () => {
        const wrapper = mount(ReaderSettingsModal, { props: { isVisible: true } });

        await wrapper.findComponent(LButton).trigger("click");

        expect(wrapper.emitted()).toHaveProperty("close");
    });
});
