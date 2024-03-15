import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useSocketConnectionStore } from "@/stores/socketConnection";

const purgeMock = vi.hoisted(() => vi.fn());

vi.mock("@/util/purgeLocalDatabase", () => ({
    purgeLocalDatabase: purgeMock,
}));

const reloadMock = vi.hoisted(() => vi.fn());

// @ts-ignore This works even though TS thinks it's the wrong type
window.location = { reload: reloadMock };

describe("purgeLocalDatabase", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("purges the local database when connected", async () => {
        const socketConnectionStore = useSocketConnectionStore();
        const wrapper = mount(SettingsPage);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(purgeMock).not.toHaveBeenCalled();

        socketConnectionStore.isConnected = true;

        await wrapper.vm.$nextTick();
        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(purgeMock).toHaveBeenCalledOnce();
        expect(reloadMock).toHaveBeenCalledOnce();
    });
});
