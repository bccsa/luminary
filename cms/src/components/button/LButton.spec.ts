import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LButton from "./LButton.vue";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";

describe("LButton", () => {
    it("renders the default slot and icon", async () => {
        const wrapper = mount(LButton, {
            props: { icon: DocumentPlusIcon },
            slots: { default: "Button text" },
        });

        expect(wrapper.text()).toBe("Button text");
        expect(wrapper.findComponent(DocumentPlusIcon).exists()).toBe(true);
    });

    it("can be a button or anchor element", async () => {
        const wrapper = mount(LButton);
        expect(wrapper.html()).toContain("<button");

        await wrapper.setProps({ is: "a" });

        expect(wrapper.html()).toContain("<a");
    });
});
