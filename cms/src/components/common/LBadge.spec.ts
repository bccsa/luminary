import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LBadge from "./LBadge.vue";

describe("LBadge", () => {
    it("renders the default slot", async () => {
        const wrapper = mount(LBadge, {
            slots: { default: "Badge text" },
        });

        expect(wrapper.text()).toBe("Badge text");
    });
});
