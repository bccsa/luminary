import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import LDialog from "@/components/common/LDialog.vue";
import { recordUserActivity } from "@/userActivity/store";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { db, isConnected } from "luminary-shared";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { useNotificationStore } from "@/stores/notification";
import {
    createDownloadsServiceStub,
    provideDownloadsStub,
    stubEntry,
    type DownloadsServiceStub,
} from "@/tests/downloadsServiceStub";
import {
    isDataSaverEnabled,
    dataSaverLevel,
    localCacheVersion,
    youtubeAlwaysAllow,
    subtitlesOnVideo,
    autoplayNext,
} from "@/globalConfig";
import { mediaPlayerItem } from "@/media-player/mediaPlayer";
import { autoplayDownloadedOnly } from "@/media-player/autoplayMode";

vi.mock("@/globalConfig", async () => {
    const { computed, ref, watch } = await import("vue");
    const isDataSaverEnabled = vi.fn(() => false);
    const dataSaverLevel = ref<"off" | "light" | "strict" | null>(null);
    const effectiveDataSaverLevel = computed(
        () => dataSaverLevel.value ?? (isDataSaverEnabled() ? "light" : "off"),
    );
    const localCacheVersion = ref(0);
    const youtubeAlwaysAllow = ref(false);
    const subtitlesOnVideo = ref(false);
    const autoplayNext = ref(true);
    watch(autoplayNext, (on) => {
        localStorage.setItem("autoplay", String(on));
    });
    watch(subtitlesOnVideo, (onVideo) => {
        localStorage.setItem("subtitlesOnVideo", String(onVideo));
    });
    watch(youtubeAlwaysAllow, (allowed) => {
        localStorage.setItem("youtubeAlwaysAllow", String(allowed));
    });
    watch(dataSaverLevel, (level) => {
        if (level) localStorage.setItem("dataSaverLevel", level);
    });
    return {
        getDeviceInfo: () => ({ platform: "Test OS", userAgent: "Test Browser" }),
        isTestEnviroment: true,
        isDataSaverEnabled,
        dataSaverLevel,
        effectiveDataSaverLevel,
        localCacheVersion,
        youtubeAlwaysAllow,
        subtitlesOnVideo,
        autoplayNext,
    };
});
vi.mock("@/components/BasePage.vue", async () => {
    const { defineComponent } = await import("vue");
    return { default: defineComponent({ template: "<div><slot /></div>" }) };
});
vi.mock("@/sync", () => ({ triggerSync: vi.fn() }));

// Keep the probe out of unit tests — return a fixed reactive speed.
vi.mock("@/composables/useNetworkSpeedEstimator", async () => {
    const { ref, computed } = await import("vue");
    const connectionSpeed = ref(10);
    const isSlowConnection = computed(() => connectionSpeed.value < 4);
    return {
        connectionSpeed,
        isSlowConnection,
        useNetworkSpeedEstimator: () => ({ connectionSpeed, isSlowConnection, runProbe: vi.fn() }),
    };
});
import { connectionSpeed } from "@/composables/useNetworkSpeedEstimator";

vi.mock("vue-router");
vi.mock("@/router", () => ({
    default: {},
    getRouteHistory: () => ({ value: [] }),
    markInternalNavigation: vi.fn(),
    isExternalNavigation: vi.fn(),
}));

// Keys a test takes out, as a language document older than the app lacks them.
const missingKeys = vi.hoisted(() => new Set<string>());
// vue-i18n's `te` reads a flat dotted key as a path and never finds it, as with the app's language documents.
const flatKeys = vi.hoisted(() => ({ on: false }));
vi.mock("vue-i18n", () => ({
    useI18n: () => {
        const messages = () =>
            Object.fromEntries(
                Object.entries(mockLanguageDtoEng.translations as Record<string, string>).filter(
                    ([key]) => !missingKeys.has(key),
                ),
            );
        const has = (key: string) => key in messages();
        return {
            t: (key: string) => (has(key) ? messages()[key] : key),
            te: (key: string) => !flatKeys.on && has(key),
            locale: { value: "eng" },
            getLocaleMessage: () => messages(),
        };
    },
}));

const mountSettingsPage = () =>
    mount(SettingsPage, {
        global: {
            stubs: {
                BasePage: { template: "<div><slot /></div>" },
            },
        },
    });

describe("SettingsPage clearing state", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("disables the button and shows the clearing label/icon while purge is pending", async () => {
        let resolvePurge: (() => void) | undefined;
        const purgeSpy = vi.spyOn(db, "purge").mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolvePurge = resolve;
                }),
        );

        const wrapper = mountSettingsPage();
        isConnected.value = true;
        await wrapper.vm.$nextTick();

        const button = wrapper.find("button[data-test='deleteLocalDatabase']");

        expect(button.text()).toContain("Delete local cache");
        expect(button.attributes("disabled")).toBeUndefined();
        expect(wrapper.find("svg.animate-spin").exists()).toBe(false);

        await button.trigger("click");
        await wrapper.vm.$nextTick();

        expect(purgeSpy).toHaveBeenCalled();
        expect(button.text()).toContain("Clearing local cache...");
        expect(button.attributes("disabled")).toBeDefined();
        expect(wrapper.find("svg.animate-spin").exists()).toBe(true);

        resolvePurge!();
        await flushPromises();

        expect(button.text()).toContain("Delete local cache");
        expect(button.attributes("disabled")).toBeUndefined();
        expect(wrapper.find("svg.animate-spin").exists()).toBe(false);
    });

    it("bumps localCacheVersion after a successful purge (invalidates kept-alive pages)", async () => {
        vi.spyOn(db, "purge").mockResolvedValue(undefined);
        const before = localCacheVersion.value;

        const wrapper = mountSettingsPage();
        isConnected.value = true;
        await wrapper.vm.$nextTick();

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await flushPromises();

        expect(localCacheVersion.value).toBe(before + 1);
    });

    it("does NOT purge or bump the cache version when offline", async () => {
        const purgeSpy = vi.spyOn(db, "purge").mockResolvedValue(undefined);
        const before = localCacheVersion.value;

        const wrapper = mountSettingsPage();
        isConnected.value = false;
        await wrapper.vm.$nextTick();

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await flushPromises();

        expect(purgeSpy).not.toHaveBeenCalled();
        expect(localCacheVersion.value).toBe(before);
    });
});

describe("SettingsPage data saver", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        vi.mocked(isDataSaverEnabled).mockReturnValue(false);
        connectionSpeed.value = 10;
        // Touched so the level reads the device flag each test sets.
        dataSaverLevel.value = "off";
        dataSaverLevel.value = null;
        localStorage.clear();
    });

    afterEach(() => {
        vi.mocked(isDataSaverEnabled).mockReset();
        dataSaverLevel.value = null;
        localStorage.clear();
    });

    it("renders the live connection speed from the composable", () => {
        const wrapper = mountSettingsPage();
        expect(wrapper.text()).toContain("10.0 Mbps");
    });

    it("offers Off, Light and Strict, and keeps the level chosen", async () => {
        const wrapper = mountSettingsPage();
        expect(wrapper.find("[data-test='dataSaverLevel-off']").attributes("aria-checked")).toBe(
            "true",
        );

        await wrapper.find("[data-test='dataSaverLevel-light']").trigger("click");
        expect(dataSaverLevel.value).toBe("light");
        expect(localStorage.getItem("dataSaverLevel")).toBe("light");
        expect(wrapper.find("[data-test='dataSaverLevel-light']").attributes("aria-checked")).toBe(
            "true",
        );

        await wrapper.find("[data-test='dataSaverLevel-strict']").trigger("click");
        expect(dataSaverLevel.value).toBe("strict");
        expect(wrapper.find("[data-test='dataSaverLevelDescription']").text()).toContain(
            "sound only",
        );
    });

    it("shows its English where the language does not have the words yet, not the bare keys", async () => {
        // The title and the slow-connection note are older than the levels, so every language has them.
        const keys = Object.keys(mockLanguageDtoEng.translations).filter(
            (key) =>
                key.startsWith("settings.data_saver.") &&
                !["settings.data_saver.title", "settings.data_saver.slow_connection_note"].includes(
                    key,
                ),
        );
        keys.forEach((key) => missingKeys.add(key));
        try {
            const wrapper = mountSettingsPage();
            await wrapper.find("[data-test='dataSaverLevel-strict']").trigger("click");
            expect(wrapper.text()).not.toMatch(/settings\.(data_saver|autoplay)\./);
            expect(wrapper.find("[data-test='dataSaverLevel-strict']").text()).toBe("Strict");
            expect(wrapper.find("[data-test='dataSaverLevelDescription']").text()).toContain(
                "sound only",
            );
            expect(wrapper.text()).toContain("When a video ends");
        } finally {
            keys.forEach((key) => missingKeys.delete(key));
        }
    });

    it("shows the language's own words for flat dotted keys that te() cannot find", async () => {
        const translations = mockLanguageDtoEng.translations as Record<string, string>;
        const before = translations["settings.data_saver.strict"];
        translations["settings.data_saver.strict"] = "Streng";
        flatKeys.on = true;
        try {
            const wrapper = mountSettingsPage();
            expect(wrapper.find("[data-test='dataSaverLevel-strict']").text()).toBe("Streng");
        } finally {
            flatKeys.on = false;
            translations["settings.data_saver.strict"] = before;
        }
    });

    it("lets the viewer choose where subtitles go: under the video by default, or over it", async () => {
        const wrapper = mountSettingsPage();
        const toggle = wrapper.find("[data-test='subtitlesOnVideoToggle']");
        expect(toggle.exists()).toBe(true);
        expect(subtitlesOnVideo.value).toBe(false);

        await toggle.trigger("click");

        expect(subtitlesOnVideo.value).toBe(true);
        expect(localStorage.getItem("subtitlesOnVideo")).toBe("true");
    });

    it("lets the viewer turn autoplay off, on by default", async () => {
        const wrapper = mountSettingsPage();
        const toggle = wrapper.find("[data-test='autoplayToggle']");
        expect(toggle.exists()).toBe(true);
        expect(autoplayNext.value).toBe(true);

        await toggle.trigger("click");

        expect(autoplayNext.value).toBe(false);
        expect(localStorage.getItem("autoplay")).toBe("false");
    });

    it('turns off "always allow" for videos hosted by YouTube', async () => {
        youtubeAlwaysAllow.value = true;
        const wrapper = mountSettingsPage();
        const toggle = wrapper.find("[data-test='youtubeAllowToggle']");
        expect(toggle.exists()).toBe(true);
        expect(toggle.attributes("aria-checked")).toBe("true");

        await toggle.trigger("click");

        expect(youtubeAlwaysAllow.value).toBe(false);
        expect(localStorage.getItem("youtubeAlwaysAllow")).toBe("false");
    });

    it("stands in Light for the device's Data Saver until a level is chosen", async () => {
        vi.mocked(isDataSaverEnabled).mockReturnValue(true);
        const wrapper = mountSettingsPage();

        expect(wrapper.find("[data-test='dataSaverLevel-light']").attributes("aria-checked")).toBe(
            "true",
        );
        expect(wrapper.find("[data-test='dataSaverNote']").text()).toContain(
            "Your device's Data Saver is on",
        );

        await wrapper.find("[data-test='dataSaverLevel-off']").trigger("click");

        expect(dataSaverLevel.value).toBe("off");
        expect(wrapper.find("[data-test='dataSaverNote']").exists()).toBe(false);
    });

    it("shows the slow-connection note only when Data Saver is otherwise off", async () => {
        connectionSpeed.value = 1;
        const wrapper = mountSettingsPage();

        expect(wrapper.find("[data-test='dataSaverNote']").text()).toContain(
            "Your connection seems slow",
        );

        dataSaverLevel.value = "light";
        await wrapper.vm.$nextTick();

        expect(wrapper.find("[data-test='dataSaverNote']").exists()).toBe(false);
    });

    it("clears the activity only after the confirmation is accepted", async () => {
        await recordUserActivity({ type: "liked", parentId: "post-1" });
        const wrapper = mount(SettingsPage);

        await wrapper.find("[data-test=clearUserActivity]").trigger("click");
        expect(await db.userActivity.count()).toBe(1);

        await wrapper.findComponent(LDialog).props("primaryAction")();

        await flushPromises();
        expect(await db.userActivity.count()).toBe(0);
    });
});

describe("SettingsPage delete local data with downloads", () => {
    let order: string[];

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        isConnected.value = true;
        order = [];
        vi.spyOn(db, "purge").mockImplementation(async () => {
            order.push("purge");
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    const mountWith = (service: DownloadsServiceStub) => {
        vi.mocked(service.lifecycle.removeAll).mockImplementation(async () => {
            order.push("removeAll");
            return { kept: [] };
        });
        vi.mocked(service.lifecycle.recheck).mockImplementation(async () => {
            order.push("recheck");
        });
        return mount(SettingsPage, {
            global: {
                provide: provideDownloadsStub(service),
                stubs: { BasePage: { template: "<div><slot /></div>" } },
            },
        });
    };
    const downloadsDialog = (wrapper: ReturnType<typeof mount>) =>
        wrapper.findAllComponents(LDialog)[1];
    const withDownloads = () =>
        createDownloadsServiceStub({ entries: [stubEntry("post-1")], totalBytes: 5_000_000 });

    it("purges at once, with no dialog, without the downloads service", async () => {
        const wrapper = mountSettingsPage();

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await flushPromises();

        expect(db.purge).toHaveBeenCalledOnce();
        expect(wrapper.findAllComponents(LDialog)).toHaveLength(1);
    });

    it("purges at once while no download exists, then restores the downloads' pins", async () => {
        const wrapper = mountWith(createDownloadsServiceStub());

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await flushPromises();

        expect(downloadsDialog(wrapper).props("open")).toBe(false);
        expect(order).toEqual(["purge", "recheck"]);
    });

    it("asks first when downloads exist, with their deletion off by default", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await flushPromises();

        expect(db.purge).not.toHaveBeenCalled();
        expect(downloadsDialog(wrapper).props("open")).toBe(true);
        const option = wrapper.findComponent({ name: "DeleteLocalDataOptionStub" });
        expect(option.props("modelValue")).toBe(false);
    });

    it("keeps the downloads and restores their pins after the purge when the option is clear", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await downloadsDialog(wrapper).props("primaryAction")();
        await flushPromises();

        expect(service.lifecycle.removeAll).not.toHaveBeenCalled();
        expect(order).toEqual(["purge", "recheck"]);
        expect(downloadsDialog(wrapper).props("open")).toBe(false);
    });

    it("deletes the downloads before the purge when the option is ticked", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await wrapper.find("[data-test='stub-delete-local-data-option']").setValue(true);
        await downloadsDialog(wrapper).props("primaryAction")();
        await flushPromises();

        expect(order).toEqual(["removeAll", "purge"]);
        const texts = vi
            .mocked(useNotificationStore().addNotification)
            .mock.calls.map(([n]) => n.title);
        expect(texts).not.toContain("A download that is playing was kept.");
    });

    it("tells the viewer when a download being played was kept, and restores its pins", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);
        vi.mocked(service.lifecycle.removeAll).mockImplementation(async () => {
            order.push("removeAll");
            return { kept: ["dl-post-1"], playing: "dl-post-1" };
        });

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await wrapper.find("[data-test='stub-delete-local-data-option']").setValue(true);
        await downloadsDialog(wrapper).props("primaryAction")();
        await flushPromises();

        expect(order).toEqual(["removeAll", "purge", "recheck"]);
        const texts = vi
            .mocked(useNotificationStore().addNotification)
            .mock.calls.map(([n]) => n.title);
        expect(texts).toContain("A download that is playing was kept.");
        expect(texts).not.toContain("Some downloads could not be deleted.");
    });

    it("tells the viewer when downloads could not be deleted, and restores their pins", async () => {
        const service = createDownloadsServiceStub({
            entries: [stubEntry("post-1"), stubEntry("post-2")],
        });
        const wrapper = mountWith(service);
        vi.mocked(service.lifecycle.removeAll).mockImplementation(async () => {
            order.push("removeAll");
            return { kept: ["dl-post-1", "dl-post-2"], playing: "dl-post-1" };
        });

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await wrapper.find("[data-test='stub-delete-local-data-option']").setValue(true);
        await downloadsDialog(wrapper).props("primaryAction")();
        await flushPromises();

        expect(order).toEqual(["removeAll", "purge", "recheck"]);
        const notes = vi
            .mocked(useNotificationStore().addNotification)
            .mock.calls.map(([n]) => [n.title, n.state]);
        expect(notes).toContainEqual(["A download that is playing was kept.", "info"]);
        expect(notes).toContainEqual(["Some downloads could not be deleted.", "error"]);
    });

    it("calls a kept download of the item in the player a failure when it was not kept for playing", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);
        vi.mocked(service.lifecycle.removeAll).mockImplementation(async () => {
            order.push("removeAll");
            return { kept: ["dl-post-1"] };
        });
        // Streamed, so the engine held no lock on it: it failed to delete.
        mediaPlayerItem.value = { content: { parentId: "post-1" } as any, language: "en" };

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await wrapper.find("[data-test='stub-delete-local-data-option']").setValue(true);
        try {
            await downloadsDialog(wrapper).props("primaryAction")();
            await flushPromises();
        } finally {
            mediaPlayerItem.value = null;
        }

        const texts = vi
            .mocked(useNotificationStore().addNotification)
            .mock.calls.map(([n]) => n.title);
        expect(texts).toContain("Some downloads could not be deleted.");
        expect(texts).not.toContain("A download that is playing was kept.");
    });

    it("still purges, and keeps the pins, when deleting the downloads fails", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);
        vi.mocked(service.lifecycle.removeAll).mockRejectedValue(new Error("io"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await wrapper.find("[data-test='stub-delete-local-data-option']").setValue(true);
        await downloadsDialog(wrapper).props("primaryAction")();
        await flushPromises();

        expect(order).toEqual(["purge", "recheck"]);
        const notes = vi
            .mocked(useNotificationStore().addNotification)
            .mock.calls.map(([n]) => [n.title, n.state]);
        expect(notes).toContainEqual(["Some downloads could not be deleted.", "error"]);
        expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: "io" }));
        logged.mockRestore();
    });

    it("neither asks nor deletes anything offline", async () => {
        const service = withDownloads();
        const wrapper = mountWith(service);
        isConnected.value = false;

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");
        await flushPromises();

        expect(downloadsDialog(wrapper).props("open")).toBe(false);
        expect(order).toEqual([]);
    });
});

describe("SettingsPage autoplay of downloads alone", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        autoplayDownloadedOnly.value = false;
    });

    const mountWith = (service?: DownloadsServiceStub) =>
        mount(SettingsPage, {
            global: {
                provide: service ? provideDownloadsStub(service) : {},
                stubs: { BasePage: { template: "<div><slot /></div>" } },
            },
        });

    it("draws nothing of it without the downloads service", () => {
        const wrapper = mountWith();
        expect(wrapper.find("[data-test='autoplayToggle']").exists()).toBe(true);
        expect(wrapper.find("[data-test='autoplayDownloadedOnly']").exists()).toBe(false);
        expect(wrapper.find("[data-test='stub-autoplay-mode']").exists()).toBe(false);
    });

    it("keeps autoplay to downloaded videos when switched on, with the pill naming the mode", async () => {
        const wrapper = mountWith(createDownloadsServiceStub());
        const pill = () => wrapper.find("[data-test='stub-autoplay-mode']");
        expect(pill().attributes("data-mode")).toBe("all");

        await wrapper.find("[data-test='autoplayDownloadedOnlyToggle']").trigger("click");

        expect(autoplayDownloadedOnly.value).toBe(true);
        expect(localStorage.getItem("autoplayDownloadedOnly")).toBe("true");
        expect(pill().attributes("data-mode")).toBe("downloaded");
    });

    it("offline, shows the forced mode and leaves the stored choice alone", async () => {
        const service = createDownloadsServiceStub({ network: { online: false, metered: false } });
        const wrapper = mountWith(service);
        const toggle = wrapper.find("[data-test='autoplayDownloadedOnlyToggle']");

        expect(wrapper.find("[data-test='stub-autoplay-mode']").attributes("data-mode")).toBe(
            "downloaded",
        );
        await toggle.trigger("click");
        expect(autoplayDownloadedOnly.value).toBe(false);

        service.networkRef.value = { online: true, metered: false };
        await flushPromises();
        expect(wrapper.find("[data-test='stub-autoplay-mode']").attributes("data-mode")).toBe(
            "all",
        );
    });
});
