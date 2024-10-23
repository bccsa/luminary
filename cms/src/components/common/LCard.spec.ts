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
});
