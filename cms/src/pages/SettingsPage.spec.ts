import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount } from "@vue/test-utils";

const purgeMock = vi.hoisted(() => vi.fn());

vi.mock("@/util/purgeLocalDatabase", () => ({
    purgeLocalDatabase: purgeMock,
}));

const reloadMock = vi.hoisted(() => vi.fn());

// @ts-ignore This works even though TS thinks it's the wrong type
window.location = { reload: reloadMock };

describe("purgeLocalDatabase", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("purges the local database", async () => {
        const wrapper = mount(SettingsPage);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        expect(purgeMock).toHaveBeenCalledOnce();
        expect(reloadMock).toHaveBeenCalledOnce();
    });
});
