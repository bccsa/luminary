import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AcBadge from "./AcBadge.vue";

describe("AcBadge", () => {
    it("renders the default slot", async () => {
        const wrapper = mount(AcBadge, {
            slots: { default: "Badge text" },
        });

        expect(wrapper.text()).toBe("Badge text");
    });
});
