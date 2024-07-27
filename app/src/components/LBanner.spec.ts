import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BarnerComponent from "./LBanner.vue";
import { isConnected } from "luminary-shared";
import { SignalSlashIcon } from "@heroicons/vue/20/solid";

describe("LBanner", async () => {
    it("renders the offline status and verifies classes and icon", async () => {
        isConnected.value = false;

        const wrapper = mount(BarnerComponent, {
            props: {
                icon: SignalSlashIcon,
                message: "Test Offline",
                bgColor: "bg-green-100",
            },
        });
        await wrapper.vm.$nextTick();

        // Check if the wrapper contains the message
        expect(wrapper.html()).toContain("Test Offline");

        // Check if the first div has the class bg-green-100
        const firstDiv = wrapper.find("div");
        expect(firstDiv.classes()).toContain("bg-green-100");

        // Check if the SignalSlashIcon component exists
        const iconComponent = wrapper.findComponent(SignalSlashIcon);
        expect(iconComponent.exists()).toBe(true);
    });
});
