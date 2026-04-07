import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LTabs from "./LTabs.vue";

const tabs = [
    { title: "General", key: "general" },
    { title: "Advanced", key: "advanced" },
    { title: "Settings", key: "settings" },
];

describe("LTabs", () => {
    it("renders tab titles in desktop nav", () => {
        const wrapper = mount(LTabs, {
            props: { tabs, currentTab: "general" },
        });

        expect(wrapper.text()).toContain("General");
        expect(wrapper.text()).toContain("Advanced");
        expect(wrapper.text()).toContain("Settings");
    });

    it("emits update:currentTab when a desktop tab is clicked", async () => {
        const wrapper = mount(LTabs, {
            props: { tabs, currentTab: "general" },
        });

        const navSpans = wrapper.findAll("nav span");
        await navSpans[1].trigger("click");

        expect(wrapper.emitted("update:currentTab")).toBeDefined();
        expect(wrapper.emitted("update:currentTab")![0]).toEqual(["advanced"]);
    });

    it("highlights the current tab", () => {
        const wrapper = mount(LTabs, {
            props: { tabs, currentTab: "advanced" },
        });

        const navSpans = wrapper.findAll("nav span");
        expect(navSpans[1].classes()).toContain("border-zinc-500");
        expect(navSpans[0].classes()).not.toContain("border-zinc-500");
    });

    it("sets aria-current on active tab", () => {
        const wrapper = mount(LTabs, {
            props: { tabs, currentTab: "general" },
        });

        const navSpans = wrapper.findAll("nav span");
        expect(navSpans[0].attributes("aria-current")).toBe("page");
        expect(navSpans[1].attributes("aria-current")).toBeUndefined();
    });

    it("renders tab icons when provided", () => {
        const MockIcon = { template: '<svg class="tab-icon" />' };
        const tabsWithIcons = [{ title: "General", key: "general", icon: MockIcon }];

        const wrapper = mount(LTabs, {
            props: { tabs: tabsWithIcons, currentTab: "general" },
        });

        expect(wrapper.find(".tab-icon").exists()).toBe(true);
    });

    it("renders the default slot content", () => {
        const wrapper = mount(LTabs, {
            props: { tabs, currentTab: "general" },
            slots: { default: "<button>Action</button>" },
        });

        expect(wrapper.text()).toContain("Action");
    });

    it("renders mobile select with options", () => {
        const wrapper = mount(LTabs, {
            props: { tabs, currentTab: "general" },
        });

        const options = wrapper.findAll("option");
        expect(options.length).toBe(3);
        expect(options[0].text()).toBe("General");
    });
});
