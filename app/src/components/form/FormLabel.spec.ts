import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FormLabel from "./FormLabel.vue";

describe("FormLabel", () => {
    it("renders the contents from the default slot", () => {
        const wrapper = mount(FormLabel, {
            slots: { default: "Test label" },
        });

        expect(wrapper.text()).toContain("Test label");
    });

    it("marks the input as required", () => {
        const wrapper = mount(FormLabel, {
            props: { required: true },
        });

        expect(wrapper.text()).toContain("Required");
    });
});
