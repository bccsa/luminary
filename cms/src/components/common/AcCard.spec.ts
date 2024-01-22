import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AcCard from "./AcCard.vue";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";

describe("AcCard", () => {
    it("renders the title, icon, and slots", async () => {
        const wrapper = mount(AcCard, {
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
});
