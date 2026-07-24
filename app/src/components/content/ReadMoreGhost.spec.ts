import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReadMoreGhost from "./ReadMoreGhost.vue";

describe("ReadMoreGhost", () => {
    it("renders a single pulsing placeholder card", () => {
        const wrapper = mount(ReadMoreGhost);

        expect(wrapper.attributes("data-test")).toBe("read-more-ghost");
        expect(wrapper.attributes("aria-hidden")).toBe("true");
        expect(wrapper.classes()).toContain("animate-pulse");
    });
});
