import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { db, isConnected } from "luminary-shared";
import { mockLanguageDtoEng } from "@/tests/mockdata";

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
