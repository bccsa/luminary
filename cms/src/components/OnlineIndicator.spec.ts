import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OnlineIndicator from "./OnlineIndicator.vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { createTestingPinia } from "@pinia/testing";

describe("OnlineIndicator", () => {
    it("renders the online status", async () => {
        const store = useSocketConnectionStore(createTestingPinia());
        store.isConnected = true;

        const wrapper = mount(OnlineIndicator);

        expect(wrapper.html()).toContain("Online");
        expect(wrapper.html()).not.toContain("Offline");

        store.isConnected = false;
        await wrapper.vm.$nextTick();

        expect(wrapper.html()).not.toContain("Online");
        expect(wrapper.html()).toContain("Offline");
    });
});
