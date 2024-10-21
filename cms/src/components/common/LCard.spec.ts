import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LCard from "./LCard.vue";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";

describe("LCard", () => {
    it("renders the title, icon, and slots", async () => {
        const wrapper = mount(LCard, {
            props: {
                title: "Card title",
                icon: DocumentPlusIcon,
            },
            slots: { default: "Card text", footer: "Card footer" },
        });

        expect(wrapper.text()).toContain("Card title");
        expect(wrapper.text()).toContain("Card text");
        expect(wrapper.text()).toContain("Card footer");
        expect(wrapper.findComponent(DocumentPlusIcon).exists()).toBe(true);
    });

    it("can be collapsed", async () => {
        const wrapper = mount(LCard, {
            props: {
                title: "Card title",
                collapsible: true,
            },
            slots: { default: "Card text", footer: "Card footer" },
        });

        await wrapper.find("button").trigger("click");
        const container = await wrapper.find("[data-test='collapsible-container']");

        expect(container.isVisible()).toBe(false);
    });

    it("can have a tab navigation", async () => {
        const wrapper = mount(LCard, {
            props: {
                title: "Card title",
                collapsible: true,
                tabs: [
                    { title: "Tab 1", content: "Content Tab 1" },
                    { title: "Tab 2", content: "Content Tab 1" },
                ],
            },
            slots: { default: "Card text", footer: "Card footer" },
        });

        const nav = wrapper.find("nav");
        expect(nav.exists()).toBe(true);

        const buttons = nav.findAll("button");
        expect(buttons.length).toBe(2);
        expect(buttons[0].text()).toBe("Tab 1");
        expect(buttons[1].text()).toBe("Tab 2");

        // Switch to Tab 1 and verify content
        await buttons[0].trigger("click");
        expect(wrapper.text()).toContain("");

        // Switch to Tab 2 and verify content
        await buttons[1].trigger("click");
        expect(wrapper.text()).toContain("");
    });
});
