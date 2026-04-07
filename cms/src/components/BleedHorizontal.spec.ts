import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BleedHorizontal from "./BleedHorizontal.vue";

describe("BleedHorizontal", () => {
    it("renders slot content", () => {
        const wrapper = mount(BleedHorizontal, {
            slots: {
                default: "<p>Test content</p>",
            },
        });

        expect(wrapper.text()).toBe("Test content");
    });
});
