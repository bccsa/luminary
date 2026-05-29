import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ProfileMenu from "./ProfileMenu.vue";
import * as auth0 from "@auth0/auth0-vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { isConnected } from "luminary-shared";
import { useI18n } from "vue-i18n";
import { useNotificationStore } from "@/stores/notification";
import { isAuthPluginInstalled } from "@/auth";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
}));

vi.mock("@auth0/auth0-vue");

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

describe("ProfileMenu", () => {
    beforeEach(() => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === "(prefers-color-scheme: dark)",
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        setActivePinia(createTestingPinia());
        isAuthPluginInstalled.value = true;
    });

    afterEach(() => {
        vi.clearAllMocks();
        isAuthPluginInstalled.value = false;
    });

    it("shows the user's name", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
            user: {
                name: "Test Person",
            },
        });

        const wrapper = mount(ProfileMenu);

        // The name now lives in the slide-in panel header, not on the trigger.
        await wrapper.find("button").trigger("click");

        expect(wrapper.html()).toContain("Test Person");
    });

    it("shows the modal when clicking the language button", async () => {
        const { t } = useI18n();

        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(ProfileMenu);

        // Open the slide-in menu, then click the "Language" item.
        await wrapper.find("button").trigger("click");

        const languageButton = wrapper.findAll("button").find((b) => b.text().includes("Language"));
        await languageButton!.trigger("click");

        expect(wrapper.html()).toContain(t("language.modal.title"));
    });

    it("logs the user out after clicking logout", async () => {
        const logout = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
            logout,
        });

        const wrapper = mount(ProfileMenu);

        isConnected.value = true;

        await wrapper.find("button").trigger("click");

        const logoutButton = wrapper.findAll("button").find((b) => b.text() === "Logout");
        await logoutButton!.trigger("click");

        // accept on the dialog
        await wrapper.find("[data-test='modal-primary-button']").trigger("click");

        await waitForExpect(() => {
            expect(logout).toHaveBeenCalled();
        });
    });

    it("displays correct notification when logging in when offline", async () => {
        const login = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
            login,
        });

        const wrapper = mount(ProfileMenu);

        const notificationStore = useNotificationStore();

        isConnected.value = false;

        await wrapper.find("button").trigger("click");

        const loginButton = wrapper.findAll("button").find((b) => b.text() === "Login");
        await loginButton!.trigger("click");
        await waitForExpect(() => {
            expect(login).not.toHaveBeenCalled();
            expect(notificationStore.addNotification).toHaveBeenCalled();
        });
    });

    it("displays correct notification when logging out when offline", async () => {
        const logout = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
            logout,
        });

        const wrapper = mount(ProfileMenu);

        const notificationStore = useNotificationStore();

        isConnected.value = false;

        await wrapper.find("button").trigger("click");

        const logoutButton = wrapper.findAll("button").find((b) => b.text() === "Logout");
        await logoutButton!.trigger("click");
        await waitForExpect(() => {
            expect(logout).not.toHaveBeenCalled();
            expect(notificationStore.addNotification).toHaveBeenCalled();
        });
    });
});
