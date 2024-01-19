import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BasePage from "./BasePage.vue";

describe("BasePage", () => {
    it("renders the title and default slot", async () => {
        const wrapper = mount(BasePage, {
            props: { title: "Page title" },
            slots: { default: "Default slot content" },
        });

        expect(wrapper.html()).toContain("Page title");
        expect(wrapper.html()).toContain("Default slot content");
    });
});
