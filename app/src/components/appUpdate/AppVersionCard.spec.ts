import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import AppVersionCard from "./AppVersionCard.vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import type { AvailableUpdate } from "@/build-time/contracts/app-update/contract";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, string>) =>
            ((mockLanguageDtoEng.translations as Record<string, string>)[key] || key).replace(
                "{version}",
                params?.version ?? "",
            ),
    }),
}));

function mountCard(installed?: string, available?: AvailableUpdate, checkedAt?: number) {
    const service = {
        installedVersion: ref(installed),
        available: ref(available),
        checkedAt: ref(checkedAt),
        applyUpdate: vi.fn(),
    };
    const wrapper = mount(AppVersionCard, {
        global: { provide: { [AppUpdateKey as symbol]: service } },
    });
    return { wrapper, service };
}

describe("AppVersionCard", () => {
    it("is hidden where the app isn't installed from a store", () => {
        const wrapper = mount(AppVersionCard);

        expect(wrapper.find('[data-test="appVersionCard"]').exists()).toBe(false);
    });

    it("shows the installed version", () => {
        const { wrapper } = mountCard("1.9.4");

        expect(wrapper.text()).toContain("App version");
        expect(wrapper.text()).toContain("1.9.4");
        expect(wrapper.find('[data-test="appVersionUpdateButton"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="appVersionUpToDate"]').exists()).toBe(false);
    });

    it("offers the available update", async () => {
        const { wrapper, service } = mountCard(
            "1.9.4",
            { kind: "store", version: "2.0.0" },
            Date.now(),
        );

        expect(wrapper.find('[data-test="appVersionUpdateAvailable"]').text()).toBe(
            "Version 2.0.0 is available.",
        );
        await wrapper.find('[data-test="appVersionUpdateButton"]').trigger("click");

        expect(service.applyUpdate).toHaveBeenCalledOnce();
    });

    it("says the app is up to date", () => {
        const { wrapper } = mountCard("2.0.0", undefined, Date.now());

        expect(wrapper.find('[data-test="appVersionUpToDate"]').text()).toBe(
            "You have the latest version.",
        );
        expect(wrapper.find('[data-test="appVersionUpdateButton"]').exists()).toBe(false);
    });
});
