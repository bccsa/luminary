import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OnlineIndicator from "./OnlineIndicator.vue";
import { isConnected } from "luminary-shared";

describe("OnlineIndicator", async () => {
    it("renders the online status", async () => {
        const wrapper = mount(OnlineIndicator);
        await wrapper.vm.$nextTick();

        expect(wrapper.html()).not.toContain("Online");
        expect(wrapper.html()).toContain("Offline");

        isConnected.value = true;

        await wrapper.vm.$nextTick();

        expect(wrapper.html()).toContain("Online");
        expect(wrapper.html()).not.toContain("Offline");
    });
});
