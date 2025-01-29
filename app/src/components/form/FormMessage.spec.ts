import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FormMessage from "./FormMessage.vue";

describe("FormMessage", () => {
    it("renders the contents from the default slot", () => {
        const wrapper = mount(FormMessage, {
            slots: { default: "Test message" },
        });

        expect(wrapper.text()).toContain("Test message");
    });
});
