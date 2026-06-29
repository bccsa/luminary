import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LToggle from "./LToggle.vue";

describe("LToggle", () => {
    it("emits update:modelValue with the toggled value on click", async () => {
        const wrapper = mount(LToggle, { props: { modelValue: false } });

        await wrapper.find("button").trigger("click");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual([true]);
    });

    it("does not emit when disabled", async () => {
        const wrapper = mount(LToggle, { props: { modelValue: false, disabled: true } });

        await wrapper.find("button").trigger("click");

        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    });

    it("exposes the checked state via aria-checked", () => {
        const wrapper = mount(LToggle, { props: { modelValue: true } });

        expect(wrapper.find("button").attributes("role")).toBe("switch");
        expect(wrapper.find("button").attributes("aria-checked")).toBe("true");
    });
});
