import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FormLabel from "./FormLabel.vue";

describe("FormLabel", () => {
    it("marks the input as required", () => {
        const wrapper = mount(FormLabel, {
            props: { required: true },
        });

        expect(wrapper.text()).toContain("Required");
    });
});
