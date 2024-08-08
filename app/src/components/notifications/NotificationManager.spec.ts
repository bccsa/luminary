import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationManager from "./NotificationToastManager.vue";
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

    it("renders correctly the toast notification from the store", () => {
        const notificationStore = useNotificationStore();
        notificationStore.notifications = [{ title: "First", type: "toast", state: "success" }];
        const wrapper = mount(NotificationManager, {
            props: {
                type: "toast",
            },
        });

        expect(wrapper.text()).toContain("First");
    });

    it("renders correctly the banner notification from the store", () => {
        const notificationStore = useNotificationStore();
        notificationStore.notifications = [{ title: "Second", type: "banner", state: "info" }];
        const wrapper = mount(NotificationManager, {
            props: {
                type: "banner",
            },
        });

        expect(wrapper.text()).toContain("Second");
    });
});
