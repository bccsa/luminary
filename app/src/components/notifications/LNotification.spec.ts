import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LNotification from "./LNotification.vue";

describe("LNotification", () => {
    it("renders the title and description", () => {
        const wrapper = mount(LNotification, {
            props: { notification: { title: "Important News", description: "Read this." } },
        });

        expect(wrapper.text()).toContain("Important News");
        expect(wrapper.text()).toContain("Read this.");
    });

    it("can be closed", async () => {
        const wrapper = mount(LNotification, {
            props: { notification: { title: "Important News", description: "Read this." } },
        });

        await wrapper.find("button").trigger("click");

        expect(wrapper.findComponent(LNotification).isVisible()).toBe(false);
    });
});
