import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LRadio from "./LRadio.vue";

describe("LRadio", () => {
    it("emits update event on input", async () => {
        const wrapper = mount(LRadio, {
            props: {
                modelValue: "test value",
                value: "test value",
                name: "test-radio",
                label: "Test Label",
            },
        });

        await wrapper.find("input").trigger("input");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual(["test value"]);
    });

    it("renders a label", () => {
        const wrapper = mount(LRadio, {
            props: { label: "Test label" },
        });

        expect(wrapper.text()).toContain("Test label");
    });

    it("renders without a label ", () => {
        const wrapper = mount(LRadio, {
            props: { name: "input" },
        });

        expect(wrapper.text()).toBe("");
    });
});
