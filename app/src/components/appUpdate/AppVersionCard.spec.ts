import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import AppVersionCard from "./AppVersionCard.vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { mockLanguageDtoEng } from "@/tests/mockdata";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, string>) =>
            ((mockLanguageDtoEng.translations as Record<string, string>)[key] || key).replace(
                "{version}",
                params?.version ?? "",
            ),
    }),
}));

function mountCard(installed?: string, store?: string) {
    const service = {
        installedVersion: ref(installed),
        storeVersion: ref(store),
        openStore: vi.fn(),
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

    it("offers a newer store version", async () => {
        const { wrapper, service } = mountCard("1.9.4", "2.0.0");

        expect(wrapper.find('[data-test="appVersionUpdateAvailable"]').text()).toBe(
            "Version 2.0.0 is available.",
        );
        await wrapper.find('[data-test="appVersionUpdateButton"]').trigger("click");

        expect(service.openStore).toHaveBeenCalledOnce();
    });

    it("says the app is up to date", () => {
        const { wrapper } = mountCard("2.0.0", "2.0.0");

        expect(wrapper.find('[data-test="appVersionUpToDate"]').text()).toBe(
            "You have the latest version.",
        );
        expect(wrapper.find('[data-test="appVersionUpdateButton"]').exists()).toBe(false);
    });
});
