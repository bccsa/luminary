import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LTextarea from "./LTextarea.vue";

describe("LTextarea", () => {
    it("emits update event on input", async () => {
        const wrapper = mount(LTextarea);
        await wrapper.find("textarea").setValue("test value");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual(["test value"]);
    });

    it("renders a label and message from the default slot", () => {
        const wrapper = mount(LTextarea, {
            props: { label: "Test label" },
            slots: { default: "Test message" },
        });

        expect(wrapper.text()).toContain("Test label");
        expect(wrapper.text()).toContain("Test message");
    });

    it("renders without a label", () => {
        const wrapper = mount(LTextarea);
        expect(wrapper.text()).toBe("");
    });

    it("passes through non-prop attributes", () => {
        const wrapper = mount(LTextarea, {
            attrs: { rows: "5" },
        });
        expect(wrapper.find("textarea").attributes("rows")).toBe("5");
    });

    it("shows error state icon when state is error", () => {
        const wrapper = mount(LTextarea, {
            props: { state: "error" },
        });

        expect(wrapper.find(".text-red-500").exists()).toBe(true);
    });

    it("does not show error icon when rightAddOn is set", () => {
        const wrapper = mount(LTextarea, {
            props: { state: "error", rightAddOn: "suffix" },
        });

        // Error icon should not render when rightAddOn is present
        expect(wrapper.find(".text-red-500").exists()).toBe(false);
        expect(wrapper.text()).toContain("suffix");
    });

    it("renders left add-on", () => {
        const wrapper = mount(LTextarea, {
            props: { leftAddOn: "prefix" },
        });

        expect(wrapper.text()).toContain("prefix");
    });

    it("applies size classes", () => {
        const wrapper = mount(LTextarea, {
            props: { size: "sm" },
        });

        expect(wrapper.find("textarea").classes()).toContain("py-1");
    });

    it("applies disabled state", () => {
        const wrapper = mount(LTextarea, {
            props: { disabled: true },
        });

        expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();
    });

    it("renders icon when provided", () => {
        const MockIcon = { template: '<svg class="mock-icon" />' };
        const wrapper = mount(LTextarea, {
            props: { icon: MockIcon },
        });

        expect(wrapper.find(".mock-icon").exists()).toBe(true);
    });

    it("links aria-describedby to message slot", () => {
        const wrapper = mount(LTextarea, {
            slots: { default: "Help text" },
        });

        const textarea = wrapper.find("textarea");
        const describedBy = textarea.attributes("aria-describedby");
        expect(describedBy).toBeDefined();
        expect(wrapper.find(`#${describedBy}`).text()).toBe("Help text");
    });

    it("does not set aria-describedby without message slot", () => {
        const wrapper = mount(LTextarea);
        expect(wrapper.find("textarea").attributes("aria-describedby")).toBeUndefined();
    });
});
