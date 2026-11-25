import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { mediaPlayerItem, mediaPlayerView } from "@/media-player/mediaPlayer";
import { makeContent } from "../../__tests__/helpers";
import { storedBytes } from "../../entries";
import { formatBytes } from "../../texts";
import DownloadsPage from "../DownloadsPage.vue";
import { disposeServices, downloaded, request, settle, setupUi } from "./fixtures";

afterEach(() => {
    disposeServices();
    vi.useRealTimers();
    useMobileChromeAutoHide().reset();
    mediaPlayerItem.value = null;
    mediaPlayerView.value = "expanded";
});

type Ctx = Awaited<ReturnType<typeof setupUi>>;

const DAY = 86_400_000;

/** Three downloads: item 1 from three days ago (the largest), item 2 from yesterday, item 3 from now. */
async function threeDownloads(ctx: Ctx) {
    const now = Date.now();
    await ctx.fake.start(
        request(1, {
            selection: { kind: "video", angleId: "main", qualityId: "720", audioLanguage: "en" },
        }),
    );
    for (let i = 0; i < 4; i++) ctx.fake.tick();
    await downloaded(ctx.fake, 2);
    await ctx.fake.start(request(3));
    await settle();
    const state = ctx.service.internals.state;
    // Their dates are set on the service's copies, which is all the page reads.
    state.applyEntry({ ...state.byId("d1")!, createdAt: now - 3 * DAY });
    state.applyEntry({ ...state.byId("d2")!, createdAt: now - DAY });
    state.applyEntry({ ...state.byId("d3")!, createdAt: now });
}

function mountPage(ctx: Ctx, counts?: Map<string, number>) {
    return mount(DownloadsPage, {
        global: {
            ...ctx.global,
            mixins: counts
                ? [
                      {
                          updated(this: { $options: { __name?: string } }) {
                              const name = this.$options.__name ?? "";
                              counts.set(name, (counts.get(name) ?? 0) + 1);
                          },
                      },
                  ]
                : [],
        },
    });
}

const titles = (wrapper: ReturnType<typeof mountPage>) =>
    wrapper.findAll("[data-test='download-card'] h3").map((h) => h.text());

describe("DownloadsPage", () => {
    it("lists downloads newest first under the date they were made, and refreshes storage", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const refresh = vi.spyOn(ctx.service, "refreshStorage");
        const wrapper = mountPage(ctx);
        expect(wrapper.get("h1").text()).toBe("My Downloads");
        expect(titles(wrapper)).toEqual(["Item 3", "Item 2", "Item 1"]);
        expect(wrapper.find("[data-test='activity-group-today']").exists()).toBe(true);
        expect(wrapper.find("[data-test='activity-group-yesterday']").exists()).toBe(true);
        expect(refresh).toHaveBeenCalled();
        expect(wrapper.find("[data-test='downloads-storage']").exists()).toBe(true);
    });

    it("sorts by oldest and by largest", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const wrapper = mountPage(ctx);
        const radio = (order: string) => wrapper.get(`[data-test='downloads-sort-${order}']`);
        expect(radio("newest").attributes("aria-checked")).toBe("true");
        await radio("oldest").trigger("click");
        expect(titles(wrapper)).toEqual(["Item 1", "Item 2", "Item 3"]);
        expect(radio("oldest").attributes("aria-checked")).toBe("true");
        await radio("largest").trigger("click");
        expect(titles(wrapper)[0]).toBe("Item 1");
        expect(titles(wrapper).slice(1).sort()).toEqual(["Item 2", "Item 3"]);
        // One list, not split by date.
        expect(wrapper.find("[data-test^='activity-group-']").exists()).toBe(false);
    });

    it("says so when there are none, with no sort or select", async () => {
        const ctx = await setupUi();
        const wrapper = mountPage(ctx);
        expect(wrapper.get("[data-test='downloads-empty']").text()).toContain(
            "Items you download will show up here.",
        );
        expect(wrapper.find("[data-test='downloads-select']").exists()).toBe(false);
        expect(wrapper.find("[data-test='downloads-sort-newest']").exists()).toBe(false);
    });

    it("shows nothing of the list before the engine's list arrives", async () => {
        const ctx = await setupUi();
        ctx.service.internals.state.ready.value = false;
        const wrapper = mountPage(ctx);
        expect(wrapper.find("[data-test='downloads-empty']").exists()).toBe(false);
        ctx.service.internals.state.ready.value = true;
        await settle();
        expect(wrapper.find("[data-test='downloads-empty']").exists()).toBe(true);
    });

    it("totals the space a selection frees, and deletes it after confirming", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const remove = vi.spyOn(ctx.service, "remove");
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        const box = (title: string) =>
            wrapper
                .findAll("[data-test='download-card']")
                .find((c) => c.get("h3").text() === title)!
                .get("[data-test='download-card-select']");
        await box("Item 1").setValue(true);
        await box("Item 2").setValue(true);
        const state = ctx.service.internals.state;
        const total = storedBytes(state.byId("d1")!) + storedBytes(state.byId("d2")!);
        const bar = () => wrapper.get("[data-test='downloads-selection-bar']");
        expect(bar().text()).toContain("2 selected");
        expect(bar().get("[data-test='downloads-selection-frees']").text()).toContain(
            `frees ${formatBytes(total, "eng")}`,
        );
        await box("Item 2").setValue(false);
        expect(bar().text()).toContain("1 selected");

        await box("Item 2").setValue(true);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        expect(remove).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain(`This frees ${formatBytes(total, "eng")} on this device.`);
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(remove.mock.calls[0][0].sort()).toEqual(["d1", "d2"]);
        expect(titles(wrapper)).toEqual(["Item 3"]);
        expect(wrapper.find("[data-test='downloads-selection-bar']").exists()).toBe(false);
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                title: `Downloads deleted: ${formatBytes(total, "eng")} freed.`,
            }),
        );
    });

    it("warns before deleting a download being played, deletes it, and keeps older native locks working", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        await ctx.service.player.open(makeContent({ parentId: "post-2" }), {
            preferOnline: false,
        });
        const remove = vi.spyOn(ctx.service, "remove");
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        const boxes = wrapper.findAll("[data-test='download-card-select']");
        for (const box of boxes) await box.setValue(true);
        const state = ctx.service.internals.state;
        const total =
            storedBytes(state.byId("d1")!) +
            storedBytes(state.byId("d2")!) +
            storedBytes(state.byId("d3")!);
        const bar = wrapper.get("[data-test='downloads-selection-bar']");
        expect(bar.text()).toContain("3 selected");
        expect(bar.get("[data-test='downloads-selection-frees']").text()).toContain(
            formatBytes(total, "eng"),
        );
        expect(bar.find("[data-test='downloads-selection-skips']").exists()).toBe(false);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        expect(wrapper.text()).toContain(
            "One of these is playing. It will keep playing online, which uses data.",
        );
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(remove.mock.calls[0][0].sort()).toEqual(["d1", "d2", "d3"]);
        expect(remove.mock.calls[0][1]).toEqual({ closePlaying: true });
        expect(titles(wrapper)).toEqual([]);
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                title: `Downloads deleted: ${formatBytes(total, "eng")} freed.`,
            }),
        );
    });

    it("says so when an older engine keeps a download that is playing", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        await ctx.service.player.open(makeContent({ parentId: "post-2" }), {
            preferOnline: false,
        });
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        vi.spyOn(ctx.fake, "remove").mockResolvedValueOnce([
            { downloadId: "d2", removed: false, code: "locked", freedBytes: 0 },
        ]);
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        await wrapper.findAll("[data-test='download-card-select']")[1].setValue(true);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(titles(wrapper)).toContain("Item 2");
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: "“Item 2” is playing and was kept." }),
        );
    });

    it("still marks and warns about the download that plays while another open of its item is in flight", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        await ctx.service.player.open(makeContent({ parentId: "post-2" }), {
            preferOnline: false,
        });
        await settle();
        const openPlayback = ctx.fake.openPlayback.bind(ctx.fake);
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => (release = resolve));
        vi.spyOn(ctx.fake, "openPlayback").mockImplementationOnce(async (downloadId) => {
            await gate;
            return openPlayback(downloadId);
        });
        const reopen = ctx.service.player.open(makeContent({ parentId: "post-2" }), {
            preferOnline: false,
        });
        await settle();
        const remove = vi.spyOn(ctx.service, "remove");
        const wrapper = mountPage(ctx);
        const card = (title: string) =>
            wrapper
                .findAll("[data-test='download-card']")
                .find((c) => c.get("h3").text() === title)!;
        expect(card("Item 2").find("[data-test='download-card-playing']").exists()).toBe(true);

        await wrapper.get("[data-test='downloads-select']").trigger("click");
        for (const box of wrapper.findAll("[data-test='download-card-select']"))
            await box.setValue(true);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        expect(wrapper.text()).toContain(
            "One of these is playing. It will keep playing online, which uses data.",
        );
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(remove.mock.calls[0][0].sort()).toEqual(["d1", "d2", "d3"]);
        expect(remove.mock.calls[0][1]).toEqual({ closePlaying: true });

        release();
        expect(await reopen).toBeNull();
    });

    it("says which downloads could not be deleted, and when the delete failed outright", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        const wrapper = mountPage(ctx);
        const remove = vi
            .spyOn(ctx.service, "remove")
            .mockResolvedValueOnce([
                { downloadId: "d1", removed: false, code: "io", freedBytes: 0 },
            ]);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        await wrapper.findAll("[data-test='download-card-select']")[2].setValue(true);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(remove).toHaveBeenCalledWith(["d1"], { closePlaying: true });
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: "“Item 1” could not be deleted.", state: "error" }),
        );
        expect(titles(wrapper)).toContain("Item 1");

        remove.mockRejectedValueOnce(new Error("engine"));
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        await wrapper.findAll("[data-test='download-card-select']")[2].setValue(true);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "The downloads could not be deleted.",
                state: "error",
            }),
        );
        expect(wrapper.find("[data-test='downloads-selection-bar']").exists()).toBe(false);
    });

    it("keeps the selection bar above the bottom chrome and moves it with the chrome", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        const bar = () => wrapper.get("[data-test='downloads-selection-bar']");
        // Phones: above the menu and the minimised player; from lg up at the foot, clear of the safe area.
        expect(bar().classes()).toContain(
            "bottom-[calc(var(--mobile-menu-h,0px)+var(--media-bar-h,0px))]",
        );
        expect(bar().classes()).toContain("lg:bottom-0");
        expect(bar().classes()).toContain("lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]");
        expect(bar().classes()).toContain("translate-y-0");
        expect(bar().attributes("data-chrome-hidden")).toBe("false");

        useMobileChromeAutoHide().hidden.value = true;
        await settle();
        expect(bar().attributes("data-chrome-hidden")).toBe("true");
        expect(bar().classes()).toContain(
            "translate-y-[calc(var(--mobile-menu-h,0px)-max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px)))]",
        );
        expect(bar().classes()).toContain("lg:translate-y-0");
    });

    it("leaves room for the minimised player's card beside the selection bar", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        const bar = () => wrapper.get("[data-test='downloads-selection-bar']");
        expect(bar().classes()).not.toContain("lg:pr-[26.5rem]");
        mediaPlayerItem.value = { content: makeContent(), language: null };
        mediaPlayerView.value = "mini";
        await settle();
        expect(bar().classes()).toContain("lg:pr-[26.5rem]");
        mediaPlayerView.value = "expanded";
        await settle();
        expect(bar().classes()).not.toContain("lg:pr-[26.5rem]");
    });

    it("says so in the usual notification when a card's pause fails", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        vi.spyOn(ctx.fake, "pause").mockRejectedValueOnce(
            Object.assign(new Error("io"), { code: "io" }),
        );
        const wrapper = mountPage(ctx);
        await wrapper
            .get("[data-download-id='d3'] [data-test='download-card-pause']")
            .trigger("click");
        await settle();
        expect(ctx.deps.notify).toHaveBeenCalledWith("t:downloads.sheet.action_failed", "error");
    });

    it("does not say a download could not be deleted when the engine no longer holds it", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        vi.spyOn(ctx.fake, "remove").mockResolvedValueOnce([
            { downloadId: "d1", removed: false, code: "unknown-download", freedBytes: 0 },
        ]);
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        await wrapper.findAll("[data-test='download-card-select']")[2].setValue(true);
        await wrapper.get("[data-test='downloads-delete-selected']").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ state: "error" }));
        expect(titles(wrapper)).not.toContain("Item 1");
    });

    it("leaves the selection with a download that goes away", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const wrapper = mountPage(ctx);
        await wrapper.get("[data-test='downloads-select']").trigger("click");
        for (const box of wrapper.findAll("[data-test='download-card-select']"))
            await box.setValue(true);
        expect(wrapper.get("[data-test='downloads-selection-bar']").text()).toContain("3 selected");
        ctx.service.internals.state.remove("d2");
        await settle();
        expect(wrapper.get("[data-test='downloads-selection-bar']").text()).toContain("2 selected");
    });

    it("shows the resume banner while downloads are interrupted, and resumes them all", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        ctx.fake.fail("d3", "interrupted");
        await settle();
        const resumeAll = vi.spyOn(ctx.service, "resumeAll");
        const wrapper = mountPage(ctx);
        expect(wrapper.get("[data-test='downloads-resume-banner']").text()).toContain(
            "Downloads were interrupted.",
        );
        await wrapper.get("[data-test='downloads-resume-all']").trigger("click");
        expect(resumeAll).toHaveBeenCalledWith({ meteredConsent: false });
    });

    it("shows a revoked download with why and what restores it", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        await ctx.fake.revoke("d2", "access");
        await settle();
        const wrapper = mountPage(ctx);
        const revoked = wrapper.get("[data-download-id='d2']");
        expect(revoked.attributes("data-status")).toBe("revoked");
        expect(revoked.get("[data-test='download-card-attention']").text()).toContain(
            "if your access returns",
        );
    });

    it("reaches the service from a card's actions", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const pause = vi.spyOn(ctx.service, "pause");
        const wrapper = mountPage(ctx);
        await wrapper
            .get("[data-download-id='d3'] [data-test='download-card-pause']")
            .trigger("click");
        expect(pause).toHaveBeenCalledWith("d3");
    });

    it("re-renders neither the page nor other cards on a progress tick", async () => {
        const ctx = await setupUi();
        await threeDownloads(ctx);
        const counts = new Map<string, number>();
        const wrapper = mountPage(ctx, counts);
        await settle();
        counts.clear();
        const progress = wrapper.get(
            "[data-download-id='d3'] [data-test='download-card-progress']",
        );
        ctx.service.internals.state.applyProgress({
            downloadId: "d3",
            bytesDone: 16_000_000,
            bytesTotal: 32_000_000,
            bytesPerSecond: 1,
            units: {},
        });
        await settle();
        expect(progress.attributes("aria-valuenow")).toBe("50");
        expect(counts.get("DownloadsPage") ?? 0).toBe(0);
        expect(counts.get("DownloadCard")).toBe(1);
    });
});
