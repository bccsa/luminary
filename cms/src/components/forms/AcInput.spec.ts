import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AcInput from "./AcInput.vue";

describe("AcInput", () => {
    it("emits update event on input", async () => {
        const wrapper = mount(AcInput);
        await wrapper.find("input").setValue("test value");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual(["test value"]);
    });

    it("renders a label and message from the default slot", () => {
        const wrapper = mount(AcInput, {
            props: { label: "Test label" },
            slots: { default: "Test message" },
        });

        expect(wrapper.text()).toContain("Test message");
        expect(wrapper.text()).toContain("Test label");
    });

    it("renders without a label ", () => {
        const wrapper = mount(AcInput);

        expect(wrapper.text()).toBe("");
    });

    it("passes through non-prop attributes", () => {
        const wrapper = mount(AcInput, { attrs: { autocomplete: true } });
        expect(wrapper.html()).toContain('autocomplete="true"');
    });
});
