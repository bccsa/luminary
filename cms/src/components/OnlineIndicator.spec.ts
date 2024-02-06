import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OnlineIndicator from "./OnlineIndicator.vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { createTestingPinia } from "@pinia/testing";

describe("OnlineIndicator", () => {
    it("renders the online status", async () => {
        const store = useSocketConnectionStore(createTestingPinia());

        const wrapper = mount(OnlineIndicator);

        expect(wrapper.html()).not.toContain("Online");
        expect(wrapper.html()).toContain("Offline");

        store.isConnected = true;
        await wrapper.vm.$nextTick();

        expect(wrapper.html()).toContain("Online");
        expect(wrapper.html()).not.toContain("Offline");
    });
});
