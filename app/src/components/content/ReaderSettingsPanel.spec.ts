import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ReaderSettingsPanel from "./ReaderSettingsPanel.vue";
import TextSizeSlider from "./TextSizeSlider.vue";
import { TEXT_SIZES, useReaderSettings } from "@/composables/useReaderSettings";

describe("ReaderSettingsPanel", () => {
    const settings = useReaderSettings();

    beforeEach(() => {
        settings.textSize.value = 2;
        settings.lineHeight.value = 1;
        settings.font.value = "inter";
    });

    it("edits the shared text size, line height and font", async () => {
        const wrapper = mount(ReaderSettingsPanel);

        await wrapper.find("[data-test='textSizeSlider']").setValue("4");
        await wrapper.findAll("[data-test='lineHeightOption']")[2].trigger("click");
        await wrapper.find("[data-test='l-select-trigger']").trigger("click");
        const lexend = wrapper.findAll("[name='list-item']").find((o) => o.text() === "Lexend")!;
        await lexend.trigger("click");

        expect(settings.textSize.value).toBe(4);
        expect(settings.lineHeight.value).toBe(2);
        expect(settings.font.value).toBe("lexend");
        expect(wrapper.get("[data-test='l-select-value']").text()).toBe("Lexend");
    });

    it("renders the preview with the current reader settings", async () => {
        const wrapper = mount(ReaderSettingsPanel);
        const preview = () => wrapper.find("[data-test='readerPreview']");

        settings.textSize.value = 4;
        settings.font.value = "literata";
        await wrapper.vm.$nextTick();

        expect(preview().classes()).toEqual(expect.arrayContaining(["reader-font", "reader-text"]));
        const style = preview().attributes("style");
        expect(style).toContain(`--reader-scale: ${TEXT_SIZES[4]}`);
        expect(style).toContain("Literata");
    });
});

describe("TextSizeSlider", () => {
    const { textSize } = useReaderSettings();

    it("steps the shared text size and stops at either end", async () => {
        textSize.value = 1;
        const wrapper = mount(TextSizeSlider);

        await wrapper.find("[data-test='textSizeDecrease']").trigger("click");
        expect(textSize.value).toBe(0);
        expect(wrapper.find("[data-test='textSizeDecrease']").attributes()).toHaveProperty(
            "disabled",
        );

        await wrapper.find("[data-test='textSizeSlider']").setValue("3");
        expect(textSize.value).toBe(3);

        await wrapper.find("[data-test='textSizeIncrease']").trigger("click");
        expect(textSize.value).toBe(4);
        expect(wrapper.find("[data-test='textSizeIncrease']").attributes()).toHaveProperty(
            "disabled",
        );
    });
});
