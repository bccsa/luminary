import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadStartRequest } from "@/build-time/contracts/downloads/contract";
import { createFakeEngine, type FakeEngineOptions } from "../../fakeEngine";
import { createDownloadsService, type DownloadsRuntime } from "../../service";
import { makeDeps, makeParent } from "../../__tests__/helpers";
import { remainingBytes } from "../../entries";
import { formatBytes } from "../../texts";
import { settle } from "./fixtures";
import DownloadBadge from "../DownloadBadge.vue";
import ResumeBanner from "../ResumeBanner.vue";
import DeleteLocalDataOption from "../DeleteLocalDataOption.vue";
import WatchFilterSwitch from "../WatchFilterSwitch.vue";
import AutoplayModePill from "../AutoplayModePill.vue";

const request = (n: number): DownloadStartRequest => ({
    downloadId: `d${n}`,
    parentId: `post-${n}`,
    parentType: "post",
    source: { masterUrl: "https://cdn.example.org/m.m3u8", artworkUrls: [] },
    selection: { kind: "audio", audioLanguage: "en" },
    chapterIndices: [0, 1, 2],
    content: {
        title: `Item ${n}`,
        contentId: `content-${n}`,
        language: "lang-eng",
        memberOf: [],
        durationSeconds: 0,
    },
    texts: { title: `Item ${n}` },
    volumeId: "internal",
    meteredConsent: false,
    expiresAt: null,
});

let services: DownloadsRuntime[] = [];
afterEach(() => {
    services.forEach((s) => s.dispose());
    services = [];
});

async function setup(options: FakeEngineOptions = {}) {
    const fake = createFakeEngine(options);
    const helpers = makeDeps();
    helpers.docs.set("post-1", makeParent());
    const service = createDownloadsService(fake, helpers.deps);
    services.push(service);
    await service.whenReady;
    const global = { provide: { [DownloadsKey as symbol]: service } };
    return { fake, service, global };
}

describe("DownloadBadge", () => {
    it("shows nothing without a download", async () => {
        const { global } = await setup();
        const wrapper = mount(DownloadBadge, { props: { parentId: "post-1" }, global });
        expect(wrapper.find("[data-test='download-badge']").exists()).toBe(false);
    });

    it("shows nothing without the service", () => {
        const wrapper = mount(DownloadBadge, { props: { parentId: "post-1" } });
        expect(wrapper.html()).not.toContain("download-badge");
    });

    it("follows the download from progress to downloaded", async () => {
        const { fake, global } = await setup();
        const wrapper = mount(DownloadBadge, { props: { parentId: "post-1" }, global });
        const badge = () => wrapper.get("[data-test='download-badge']");
        await fake.start(request(1));
        await wrapper.vm.$nextTick();
        expect(badge().attributes("data-state")).toBe("progress");
        expect(badge().attributes("aria-label")).toBe("Downloading, 0%");
        fake.tick();
        await wrapper.vm.$nextTick();
        expect(badge().attributes("aria-label")).toMatch(/^Downloading, [1-9]\d?%$/);
        for (let i = 0; i < 3; i++) fake.tick();
        await wrapper.vm.$nextTick();
        expect(badge().attributes("data-state")).toBe("downloaded");
        expect(badge().attributes("aria-label")).toBe("Downloaded");
        fake.fail("d1", "http");
        await wrapper.vm.$nextTick();
        expect(badge().attributes("data-state")).toBe("attention");
        expect(badge().attributes("aria-label")).toBe("Download needs attention");
    });

    it("re-renders only the tile whose badge changed", async () => {
        const { fake, global } = await setup();
        await fake.start(request(1));
        await fake.start(request(2));
        const one = mount(DownloadBadge, { props: { parentId: "post-1" }, global });
        const two = mount(DownloadBadge, { props: { parentId: "post-2" }, global });
        // A render makes a new tree, so an untouched tile keeps the one it had.
        const oneTree = one.vm.$.subTree;
        const twoTree = two.vm.$.subTree;
        fake.tick();
        fake.tick();
        await one.vm.$nextTick();
        expect(one.vm.$.subTree).not.toBe(oneTree);
        expect(two.vm.$.subTree).toBe(twoTree);
    });
});

describe("ResumeBanner", () => {
    async function interrupted(options: FakeEngineOptions = {}) {
        const ctx = await setup(options);
        await ctx.fake.start(request(1));
        ctx.fake.fail("d1", "interrupted");
        return ctx;
    }

    it("is hidden while nothing is interrupted, and for a download the viewer paused", async () => {
        const { fake, global } = await setup();
        const wrapper = mount(ResumeBanner, { global });
        expect(wrapper.find("[data-test='downloads-resume-banner']").exists()).toBe(false);
        await fake.start(request(1));
        await fake.pause("d1");
        await wrapper.vm.$nextTick();
        expect(wrapper.find("[data-test='downloads-resume-banner']").exists()).toBe(false);
    });

    it("resumes all at once on Wi-Fi", async () => {
        const { service, global } = await interrupted();
        const resumeAll = vi.spyOn(service, "resumeAll");
        const wrapper = mount(ResumeBanner, { global });
        await wrapper.get("[data-test='downloads-resume-all']").trigger("click");
        expect(resumeAll).toHaveBeenCalledWith({ meteredConsent: false });
    });

    it("asks the mobile-data question first on a metered network and passes the answer", async () => {
        const { service, global } = await interrupted({ network: { metered: true } });
        const resumeAll = vi.spyOn(service, "resumeAll");
        const wrapper = mount(ResumeBanner, { global });
        expect(wrapper.text()).toContain("Downloads were interrupted.");
        await wrapper.get("[data-test='downloads-resume-all']").trigger("click");
        expect(resumeAll).not.toHaveBeenCalled();
        const entry = service.entries.value[0];
        const size = formatBytes(
            remainingBytes(entry, service.progress.value.get(entry.downloadId)),
            "eng",
        );
        expect(wrapper.text()).toContain("Use mobile data?");
        expect(wrapper.text()).toContain(`This may use about ${size}.`);
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        expect(resumeAll).toHaveBeenCalledWith({ meteredConsent: true });
    });

    it("asks about mobile data for exactly what Resume all then resumes", async () => {
        const { fake, service, global } = await setup({ network: { metered: true } });
        for (const n of [1, 2, 3, 4]) await fake.start(request(n));
        fake.fail("d1", "interrupted");
        await fake.pause("d2");
        // d3 waits for Wi-Fi; d4 waits too, but holds everything and only refreshes its item.
        const state = service.internals.state;
        const d4 = state.byId("d4")!;
        state.applyEntry({
            ...d4,
            item: { ...d4.item, state: "done" },
            units: d4.units.map((u) => ({ ...u, state: "done" as const })),
        });
        await settle();
        const remaining = (id: string) =>
            remainingBytes(state.byId(id)!, service.progress.value.get(id));
        const expected = remaining("d1") + remaining("d2") + remaining("d3");
        const resume = vi.spyOn(fake, "resume");
        const wrapper = mount(ResumeBanner, { global });
        await wrapper.get("[data-test='downloads-resume-all']").trigger("click");
        expect(wrapper.text()).toContain(`This may use about ${formatBytes(expected, "eng")}.`);
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(resume.mock.calls.map(([id]) => id).sort()).toEqual(["d1", "d2", "d3"]);
    });
});

describe("DeleteLocalDataOption", () => {
    it("shows only while downloads exist, unticked, and reports the choice", async () => {
        const { fake, service, global } = await setup();
        const wrapper = mount(DeleteLocalDataOption, { global, props: { modelValue: false } });
        expect(wrapper.find("[data-test='delete-local-data-downloads']").exists()).toBe(false);
        await fake.start(request(1));
        fake.tick();
        await wrapper.vm.$nextTick();
        const size = formatBytes(service.lifecycle.totalBytes.value, "eng");
        expect(wrapper.text()).toBe(`Also delete downloads (${size})`);
        const box = wrapper.get("input[type='checkbox']");
        expect((box.element as HTMLInputElement).checked).toBe(false);
        await box.setValue(true);
        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([true]);
    });
});

describe("WatchFilterSwitch", () => {
    it("switches between downloaded and all", async () => {
        const wrapper = mount(WatchFilterSwitch, { props: { modelValue: true } });
        expect(wrapper.get("[role='radiogroup']").attributes("aria-label")).toBe("Videos to show");
        expect(wrapper.get("[data-test='watch-filter-downloaded']").text()).toBe("Downloaded");
        expect(
            wrapper.get("[data-test='watch-filter-downloaded']").attributes("aria-checked"),
        ).toBe("true");
        await wrapper.get("[data-test='watch-filter-all']").trigger("click");
        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
    });
});

describe("AutoplayModePill", () => {
    it("names the mode", () => {
        const wrapper = mount(AutoplayModePill, { props: { mode: "downloaded" } });
        expect(wrapper.get("[data-test='autoplay-mode-pill']").attributes("data-mode")).toBe(
            "downloaded",
        );
        expect(wrapper.text()).toContain("Downloaded only");
    });
});
