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
import {
    isDataSaverEnabled,
    dataSaverLevel,
    localCacheVersion,
    youtubeAlwaysAllow,
    subtitlesOnVideo,
} from "@/globalConfig";

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

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => (mockLanguageDtoEng.translations as Record<string, string>)[key] || key,
    }),
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

    it("lets the viewer choose where subtitles go: under the video by default, or over it", async () => {
        const wrapper = mountSettingsPage();
        const toggle = wrapper.find("[data-test='subtitlesOnVideoToggle']");
        expect(toggle.exists()).toBe(true);
        expect(subtitlesOnVideo.value).toBe(false);

        await toggle.trigger("click");

        expect(subtitlesOnVideo.value).toBe(true);
        expect(localStorage.getItem("subtitlesOnVideo")).toBe("true");
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
