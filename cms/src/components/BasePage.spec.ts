import { describe, it, expect } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import BasePage from "./BasePage.vue";

describe("BasePage", () => {
    it("renders the title and default slot", async () => {
        const wrapper = mount(BasePage, {
            props: { title: "Page title" },
            slots: { default: "Default slot content" },
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        expect(wrapper.text()).toContain("Page title");
        expect(wrapper.text()).toContain("Default slot content");
    });

    it("renders the back link", async () => {
        const wrapper = mount(BasePage, {
            props: { backLinkLocation: { name: "posts.index" }, backLinkText: "Posts" },
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        const routerLink = await wrapper.findComponent(RouterLinkStub);
        expect(routerLink.props().to).toEqual({ name: "posts.index" });
        expect(wrapper.text()).toContain("Posts");
    });
});
