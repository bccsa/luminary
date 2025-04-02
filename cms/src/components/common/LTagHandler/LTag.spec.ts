import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LTag from "./LTag.vue";

describe("LTag", () => {
    it("renders the default slot", async () => {
        const wrapper = mount(LTag, {
            slots: { default: "Tag content" },
        });

        expect(wrapper.text()).toContain("Tag content");
    });

    it("emits an event when the button is clicked", async () => {
        const wrapper = mount(LTag, {
            slots: { default: "Tag content" },
        });

        await wrapper.find("button").trigger("click");

        const removeEvent = wrapper.emitted("remove");
        expect(removeEvent).not.toBe(undefined);
    });

    it("doesn't display the button when the tag is disabled", async () => {
        const wrapper = mount(LTag, {
            props: { disabled: true },
            slots: { default: "Tag content" },
        });

        expect(wrapper.find("button").exists()).toBe(false);
    });
});
