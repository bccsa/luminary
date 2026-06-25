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

        // Click on the collapse button
        await wrapper.find("[data-test='collapse-button']").trigger("click");
        const container = await wrapper.find("[data-test='collapsible-container']");

        expect(container.isVisible()).toBe(false);
    });

    it("toggles when the whole header is clicked", async () => {
        const wrapper = mount(LCard, {
            props: {
                title: "Card title",
                collapsible: true,
            },
            slots: { default: "Card text" },
        });

        const header = wrapper.find("[data-test='card-header']");
        // Read the v-show inline style each time. (Repeated isVisible() calls on the same selector
        // are unreliable in @vue/test-utils; the inline `display` style is the source of truth.)
        const isCollapsed = () =>
            (wrapper.find("[data-test='collapsible-container']").attributes("style") ?? "").includes(
                "display: none",
            );

        expect(isCollapsed()).toBe(false);

        // Clicking anywhere on the header collapses the card...
        await header.trigger("click");
        expect(isCollapsed()).toBe(true);

        // ...and clicking the collapsed card (its header) expands it again.
        await header.trigger("click");
        expect(isCollapsed()).toBe(false);
    });

    it("does not toggle when a non-collapsible card header is clicked", async () => {
        const wrapper = mount(LCard, {
            props: {
                title: "Card title",
                collapsible: false,
            },
            slots: { default: "Card text" },
        });

        await wrapper.find("[data-test='card-header']").trigger("click");

        expect(wrapper.find("[data-test='collapsible-container']").isVisible()).toBe(true);
    });

    it("does not collapse when an actions-slot control is clicked", async () => {
        const wrapper = mount(LCard, {
            props: {
                title: "Card title",
                collapsible: true,
            },
            slots: {
                default: "Card text",
                actions: "<button data-test='card-action'>Act</button>",
            },
        });

        await wrapper.find("[data-test='card-action']").trigger("click");

        // The action click is stopped before the header toggle — card stays expanded.
        expect(wrapper.find("[data-test='collapsible-container']").isVisible()).toBe(true);
    });
});
