import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationBottomManager from "./NotificationBottomManager.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useNotificationStore } from "@/stores/notification";

describe("NotificationBottomManager", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders correctly the banner notification from the store", () => {
        const notificationStore = useNotificationStore();
        notificationStore.notifications = [{ title: "Second", type: "bottom", state: "info" }];
        const wrapper = mount(NotificationBottomManager, {
            props: {
                type: "bottom",
            },
        });

        expect(wrapper.text()).toContain("Second");
    });
});
