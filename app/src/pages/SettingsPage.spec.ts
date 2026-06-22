import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { db, isConnected } from "luminary-shared";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { userDataSaverEnabled } from "@/globalConfig";

// Keep the probe out of unit tests — return a fixed reactive speed.
vi.mock("@/composables/useNetworkSpeed", async () => {
    const { ref, computed } = await import("vue");
    const connectionSpeed = ref(10);
    const isSlowConnection = computed(() => connectionSpeed.value < 4);
    return {
        connectionSpeed,
        isSlowConnection,
        useNetworkSpeed: () => ({ connectionSpeed, isSlowConnection, runProbe: vi.fn() }),
    };
});

vi.mock("vue-router");
vi.mock("@/router", () => ({
    default: {},
    getRouteHistory: () => ({ value: [] }),
    markInternalNavigation: vi.fn(),
    isExternalNavigation: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) =>
            (mockLanguageDtoEng.translations as Record<string, string>)[key] || key,
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
});

describe("SettingsPage data saver", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        userDataSaverEnabled.value = false;
        localStorage.clear();
    });

    afterEach(() => {
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
});
