import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LSelect from "./LSelect.vue";

const options = [
    { label: "Test item 1", value: "one" },
    { label: "Test item 2", value: "two", style: { fontFamily: "Georgia" } },
];

describe("LSelect", () => {
    it("emits update event when an option is chosen", async () => {
        const wrapper = mount(LSelect, { props: { options } });
        await wrapper.get('[data-test="l-select-trigger"]').trigger("click");
        await wrapper.findAll('[name="list-item"]')[1].trigger("click");

        expect(wrapper.emitted("update:modelValue")).toEqual([["two"]]);
    });

    it("shows the selected option in its own style", () => {
        const wrapper = mount(LSelect, { props: { options, modelValue: "two" } });
        const trigger = wrapper.get('[data-test="l-select-trigger"]');

        expect(wrapper.get('[data-test="l-select-value"]').text()).toBe("Test item 2");
        expect(trigger.attributes("style")).toContain("Georgia");
    });

    it("shows the placeholder when nothing is selected", () => {
        const wrapper = mount(LSelect, { props: { options, placeholder: "Pick one" } });
        expect(wrapper.get('[data-test="l-select-value"]').text()).toBe("Pick one");
    });

    it("does not open when disabled", async () => {
        const wrapper = mount(LSelect, { props: { options, disabled: true } });
        await wrapper.get('[data-test="l-select-trigger"]').trigger("click");
        expect(wrapper.get('[data-test="l-select-listbox"]').isVisible()).toBe(false);
    });
});
