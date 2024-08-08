import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationBannerManager from "./NotificationBannerManager.vue";
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

    it("renders correctly the banner notification from the store", () => {
        const notificationStore = useNotificationStore();
        notificationStore.notifications = [{ title: "Second", type: "banner", state: "info" }];
        const wrapper = mount(NotificationBannerManager, {
            props: {
                type: "banner",
            },
        });

        expect(wrapper.text()).toContain("Second");
    });
});
