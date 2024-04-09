import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { useNotificationStore } from "@/stores/notification";

const purgeMock = vi.hoisted(() => vi.fn());

vi.mock("@/util/purgeLocalDatabase", () => ({
    purgeLocalDatabase: purgeMock,
}));

describe("purgeLocalDatabase", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("purges the local database when connected", async () => {
        const socketConnectionStore = useSocketConnectionStore();
        const notificationStore = useNotificationStore();
        const wrapper = mount(SettingsPage);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(purgeMock).not.toHaveBeenCalled();
        expect(socketConnectionStore.reloadClientData).not.toHaveBeenCalled();
        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ state: "error" }),
        );

        socketConnectionStore.isConnected = true;

        await wrapper.vm.$nextTick();
        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(purgeMock).toHaveBeenCalledOnce();
        expect(socketConnectionStore.reloadClientData).toHaveBeenCalledOnce();
        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ state: "success" }),
        );
    });
});
