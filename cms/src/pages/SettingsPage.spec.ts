import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useNotificationStore } from "@/stores/notification";
import { db, isConnected } from "luminary-shared";

const requestDataMock = vi.hoisted(() => vi.fn());

vi.mock("luminary-shared", () => ({
    db: {
        purge: vi.fn(),
    },
    getSocket: vi.fn(() => ({
        requestData: requestDataMock,
    })),
    isConnected: { value: false },
    api: vi.fn(() => ({
        rest: vi.fn(),
    })),
}));

describe("purgeLocalDatabase", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("purges the local database when connected", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(SettingsPage);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(db.purge).not.toHaveBeenCalled();
        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ state: "error" }),
        );

        isConnected.value = true;

        await wrapper.vm.$nextTick();
        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(db.purge).toHaveBeenCalledOnce();
        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ state: "success" }),
        );
    });
});
