import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LSelect from "./LSelect.vue";

const options = [
    { label: "Test item 1", value: "one" },
    { label: "Test item 2", value: "two" },
];

const teleportStub = { template: "<div><slot /></div>" };

describe("LSelect", () => {
    it("emits update event when an option is chosen", async () => {
        const wrapper = mount(LSelect, {
            props: { options },
            global: { stubs: { Teleport: teleportStub } },
        });
        await wrapper.get('[data-test="l-select-trigger"]').trigger("click");
        const items = wrapper.findAll('[name="list-item"]');
        await items[1]!.trigger("click");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual(["two"]);
    });

    it("renders a label and message from the default slot", () => {
        const wrapper = mount(LSelect, {
            props: { label: "Test label", options },
            slots: { default: "Test message" },
        });

        expect(wrapper.text()).toContain("Test message");
        expect(wrapper.text()).toContain("Test label");
    });

    it("lists all options when opened", async () => {
        const wrapper = mount(LSelect, {
            props: { options },
            global: { stubs: { Teleport: teleportStub } },
        });

        await wrapper.get('[data-test="l-select-trigger"]').trigger("click");

        expect(wrapper.text()).toContain(options[0].label);
        expect(wrapper.text()).toContain(options[1].label);
    });

    it("passes through non-prop attributes", () => {
        const wrapper = mount(LSelect, { props: { options }, attrs: { autocomplete: true } });
        expect(wrapper.get('[data-test="l-select-trigger"]').attributes("autocomplete")).toBe("true");
    });
});
