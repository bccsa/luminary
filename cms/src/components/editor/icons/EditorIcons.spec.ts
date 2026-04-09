import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BoldIcon from "./BoldIcon.vue";
import ItalicIcon from "./ItalicIcon.vue";
import StrikethroughIcon from "./StrikethroughIcon.vue";

describe("Editor Icons", () => {
    it("BoldIcon renders an SVG", () => {
        const wrapper = mount(BoldIcon);
        expect(wrapper.find("svg").exists()).toBe(true);
    });

    it("ItalicIcon renders an SVG", () => {
        const wrapper = mount(ItalicIcon);
        expect(wrapper.find("svg").exists()).toBe(true);
    });

    it("StrikethroughIcon renders an SVG", () => {
        const wrapper = mount(StrikethroughIcon);
        expect(wrapper.find("svg").exists()).toBe(true);
    });
});
