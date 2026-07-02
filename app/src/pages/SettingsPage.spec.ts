import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { db, isConnected } from "luminary-shared";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { isDataSaverEnabled, userDataSaverEnabled, localCacheVersion } from "@/globalConfig";

vi.mock("@/globalConfig", async () => {
    const { ref, watch } = await import("vue");
    const userDataSaverEnabled = ref(false);
    const localCacheVersion = ref(0);
    watch(userDataSaverEnabled, (enabled) => {
        localStorage.setItem("dataSaver", String(enabled));
    });
    return {
        getDeviceInfo: () => ({ platform: "Test OS", userAgent: "Test Browser" }),
        isDataSaverEnabled: vi.fn(() => false),
        userDataSaverEnabled,
        localCacheVersion,
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
        userDataSaverEnabled.value = false;
        localStorage.clear();
    });

    afterEach(() => {
        vi.mocked(isDataSaverEnabled).mockReset();
        userDataSaverEnabled.value = false;
        localStorage.clear();
    });

    it("renders the live connection speed from the composable", () => {
        const wrapper = mountSettingsPage();
        expect(wrapper.text()).toContain("10.0 Mbps");
    });

    it("toggles and persists the user Data Saver preference", async () => {
        const wrapper = mountSettingsPage();
        const toggle = wrapper.find("[data-test='dataSaverToggle']");
        expect(toggle.exists()).toBe(true);
        expect(userDataSaverEnabled.value).toBe(false);

        await toggle.trigger("click");

        expect(userDataSaverEnabled.value).toBe(true);
        expect(localStorage.getItem("dataSaver")).toBe("true");
    });

    it("forces the toggle on visually and disables it when browser Data Saver is detected", async () => {
        vi.mocked(isDataSaverEnabled).mockReturnValue(true);
        const wrapper = mountSettingsPage();
        const toggle = wrapper.find("[data-test='dataSaverToggle']");

        expect(toggle.attributes("aria-checked")).toBe("true");
        expect(toggle.attributes("disabled")).toBeDefined();
        expect(wrapper.find("[data-test='dataSaverNote']").text()).toContain(
            "Your browser's Data Saver is on",
        );

        await toggle.trigger("click");

        expect(userDataSaverEnabled.value).toBe(false);
    });

    it("shows the slow-connection note only when Data Saver is otherwise off", async () => {
        connectionSpeed.value = 1;
        const wrapper = mountSettingsPage();

        expect(wrapper.find("[data-test='dataSaverNote']").text()).toContain(
            "Your connection seems slow",
        );

        userDataSaverEnabled.value = true;
        await wrapper.vm.$nextTick();

        expect(wrapper.find("[data-test='dataSaverNote']").exists()).toBe(false);
    });
});
