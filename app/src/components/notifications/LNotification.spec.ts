import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LNotification from "./LNotification.vue";

describe("LNotification", () => {
    it("renders the title and description", () => {
        const wrapper = mount(LNotification, {
            props: {
                notification: {
                    title: "Important News",
                    description: "Read this.",
                    type: "toast",
                },
            },
        });

        expect(wrapper.text()).toContain("Important News");
        expect(wrapper.text()).toContain("Read this.");
    });

    it("can be closed", async () => {
        const wrapper = mount(LNotification, {
            props: {
                notification: { title: "Important News", description: "Read this.", type: "toast" },
            },
        });

        await wrapper.find("button[data-test='toast']").trigger("click");

        expect(wrapper.text()).not.toContain("Important News");
        expect(wrapper.text()).not.toContain("Read this.");
    });
});
