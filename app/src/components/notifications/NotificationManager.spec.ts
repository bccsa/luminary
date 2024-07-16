import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationManager from "./NotificationManager.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useNotificationStore } from "@/stores/notification";

describe("NotificationManager", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders all notifications from the store", () => {
        const notificationStore = useNotificationStore();
        notificationStore.notifications = [{ title: "First" }, { title: "Second" }];
        const wrapper = mount(NotificationManager);

        expect(wrapper.text()).toContain("First");
        expect(wrapper.text()).toContain("Second");
    });
});
