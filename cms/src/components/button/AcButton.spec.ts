import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AcButton from "./AcButton.vue";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";

describe("AcButton", () => {
    it("renders the default slot and icon", async () => {
        const wrapper = mount(AcButton, {
            props: { icon: DocumentPlusIcon },
            slots: { default: "Button text" },
        });

        expect(wrapper.text()).toBe("Button text");
        expect(wrapper.findComponent(DocumentPlusIcon).exists()).toBe(true);
    });

    it("can be a button or anchor element", async () => {
        const wrapper = mount(AcButton);
        expect(wrapper.html()).toContain("<button");

        await wrapper.setProps({ is: "a" });

        expect(wrapper.html()).toContain("<a");
    });
});
