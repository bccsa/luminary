import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { formatBytes } from "../../texts";
import StorageCard from "../StorageCard.vue";
import { disposeServices, downloaded, settle, setupUi } from "./fixtures";

afterEach(disposeServices);

const MB = 1_000_000;

describe("StorageCard", () => {
    it("shows what downloads use, the free space where new ones go, and what can be cleaned up", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        await ctx.service.refreshStorage();
        const wrapper = mount(StorageCard, { global: ctx.global });
        expect(wrapper.get("section").attributes("aria-label")).toBe("Storage");
        expect(wrapper.get("[data-test='downloads-storage-used']").text()).toBe(
            formatBytes(32 * MB, "eng"),
        );
        expect(wrapper.get("[data-test='downloads-storage-free']").text()).toBe(
            formatBytes(8_000 * MB - 32 * MB, "eng"),
        );
        expect(wrapper.get("[data-test='downloads-storage-reclaimable']").text()).toBe(
            formatBytes(40 * MB, "eng"),
        );
    });

    it("cleans up, says what it freed, and is disabled with nothing to clean", async () => {
        const ctx = await setupUi();
        const wrapper = mount(StorageCard, { global: ctx.global });
        const cleanUp = vi.spyOn(ctx.service, "cleanUp");
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        await wrapper.get("[data-test='downloads-clean-up']").trigger("click");
        await settle();
        expect(cleanUp).toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: `${formatBytes(40 * MB, "eng")} freed` }),
        );
        expect(wrapper.get("[data-test='downloads-storage-reclaimable']").text()).toBe(
            formatBytes(0, "eng"),
        );
        expect(
            wrapper.get("[data-test='downloads-clean-up']").attributes("disabled"),
        ).toBeDefined();
    });

    it("says so when the clean-up fails", async () => {
        const ctx = await setupUi();
        const wrapper = mount(StorageCard, { global: ctx.global });
        vi.spyOn(ctx.service, "cleanUp").mockRejectedValueOnce(new Error("io"));
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        await wrapper.get("[data-test='downloads-clean-up']").trigger("click");
        await settle();
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Clean up did not finish. Try again later.",
                state: "error",
            }),
        );
        expect(
            wrapper.get("[data-test='downloads-clean-up']").attributes("disabled"),
        ).toBeUndefined();
    });

    it("shows no location switch without a card", async () => {
        const ctx = await setupUi();
        const wrapper = mount(StorageCard, { global: ctx.global });
        expect(wrapper.find("[data-test='downloads-location']").exists()).toBe(false);
    });

    it("switches where new downloads go while a card is present, and hides the switch when it goes", async () => {
        const ctx = await setupUi({ card: true });
        const wrapper = mount(StorageCard, { global: ctx.global });
        const location = wrapper.get("[data-test='downloads-location']");
        expect(location.get("legend").text()).toBe("Save new downloads to");
        expect(location.text()).toContain("Downloads you already have stay where they are.");
        const internal = wrapper.get("[data-test='downloads-location-internal'] input");
        const card = wrapper.get("[data-test='downloads-location-card-1'] input");
        expect((internal.element as HTMLInputElement).checked).toBe(true);
        expect(wrapper.get("[data-test='downloads-location-internal']").text()).toContain(
            "This device",
        );
        const choose = vi.spyOn(ctx.service, "setPreferredVolume");
        await card.setValue(true);
        await settle();
        expect(choose).toHaveBeenCalledWith("card-1");
        expect(ctx.service.storage.value?.preferredVolumeId).toBe("card-1");
        expect(wrapper.get("[data-test='downloads-storage-free']").text()).toBe(
            formatBytes(20_000 * MB, "eng"),
        );

        ctx.fake.setMounted("card-1", false);
        await settle();
        expect(wrapper.find("[data-test='downloads-location']").exists()).toBe(false);
    });

    it("shows no switch when the engine cannot choose volumes", async () => {
        const ctx = await setupUi({ card: true, capabilities: { volumes: false } });
        const wrapper = mount(StorageCard, { global: ctx.global });
        expect(wrapper.find("[data-test='downloads-location']").exists()).toBe(false);
    });
});
