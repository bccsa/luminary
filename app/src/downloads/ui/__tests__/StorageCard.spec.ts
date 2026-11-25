import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { formatBytes } from "../../texts";
import { makeContent } from "../../__tests__/helpers";
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

    it("cleans up, says what it freed, and says there is nothing to clean", async () => {
        const ctx = await setupUi();
        const wrapper = mount(StorageCard, { global: ctx.global });
        const origCleanUp = ctx.service.cleanUp.bind(ctx.service);
        let releaseClean!: () => void;
        const cleanUp = vi.spyOn(ctx.service, "cleanUp").mockImplementationOnce(
            () =>
                new Promise<number>((resolve) => {
                    releaseClean = () => resolve(origCleanUp());
                }),
        );
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        await wrapper.get("[data-test='downloads-clean-up']").trigger("click");
        expect(wrapper.get("[data-test='downloads-clean-up']").text()).toBe("Cleaning up…");
        expect(
            wrapper.get("[data-test='downloads-clean-up']").attributes("disabled"),
        ).toBeDefined();
        releaseClean();
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
        ).toBeUndefined();

        notify.mockClear();
        await wrapper.get("[data-test='downloads-clean-up']").trigger("click");
        await settle();
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Nothing to clean up.", state: "info" }),
        );
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

    it("switches location on a single tap before settling, and reverts with a toast on failure", async () => {
        const ctx = await setupUi({ card: true });
        const wrapper = mount(StorageCard, { global: ctx.global });
        const internal = wrapper.get("[data-test='downloads-location-internal'] input");
        const card = wrapper.get("[data-test='downloads-location-card-1'] input");

        let resolveVolume!: (ok: boolean) => void;
        vi.spyOn(ctx.service, "setPreferredVolume").mockImplementationOnce(
            () =>
                new Promise<boolean>((resolve) => {
                    resolveVolume = resolve;
                }),
        );
        await card.setValue(true);
        expect((card.element as HTMLInputElement).checked).toBe(true);
        expect((internal.element as HTMLInputElement).checked).toBe(false);

        const notify = vi.spyOn(ctx.notifications, "addNotification");
        resolveVolume(false);
        await settle();
        expect((internal.element as HTMLInputElement).checked).toBe(true);
        expect((card.element as HTMLInputElement).checked).toBe(false);
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Could not change where downloads are saved.",
                state: "error",
            }),
        );
    });

    it("uses the chosen location immediately for new downloads from the sheet", async () => {
        const ctx = await setupUi({ card: true });
        const wrapper = mount(StorageCard, { global: ctx.global });
        const start = vi.spyOn(ctx.fake, "start");
        await wrapper.get("[data-test='downloads-location-card-1'] input").setValue(true);
        await settle();

        await ctx.service.openSheet(makeContent(), { context: "player" });
        ctx.fake.act({
            action: "start",
            selection: { kind: "audio", audioLanguage: "en" },
            chapters: [0, 1, 2],
            meteredConsent: false,
        });
        await settle();
        expect(start).toHaveBeenCalledWith(expect.objectContaining({ volumeId: "card-1" }));
    });
});
