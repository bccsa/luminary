import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ProfileMenu from "./ProfileMenu.vue";
import * as auth from "@/auth";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { defineComponent, nextTick, ref, type PropType } from "vue";
import waitForExpect from "wait-for-expect";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { isConnected } from "luminary-shared";
import { useI18n } from "vue-i18n";
import { useNotificationStore } from "@/stores/notification";
import { isAuthPluginInstalled } from "@/auth";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { createDownloadsServiceStub, provideDownloadsStub } from "@/tests/downloadsServiceStub";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
}));

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());

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
        (auth as any).useAuth.mockReturnValue({
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

        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(ProfileMenu);

        // Open the slide-in menu, then click the "Language" item.
        // Language is rendered as a <span>, not a <button>, in the LSidePanel body.
        await wrapper.find("button").trigger("click");

        const languageItem = wrapper
            .findAll("span")
            .find((el) => el.text().includes(t("profile_menu.language")));
        expect(languageItem).toBeDefined();
        await languageItem!.trigger("click");

        expect(wrapper.html()).toContain(t("language.modal.title"));
    });

    it("closes the slide-in menu when a non-routed item is clicked", async () => {
        const { t } = useI18n();

        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(ProfileMenu);

        await wrapper.find("button").trigger("click");
        expect(wrapper.find("[aria-label='Close menu']").exists()).toBe(true);

        const languageItem = wrapper
            .findAll("span")
            .find((el) => el.text().includes(t("profile_menu.language")));
        await languageItem!.trigger("click");

        expect(wrapper.find("[aria-label='Close menu']").exists()).toBe(false);
    });

    it("closes the slide-in menu from its close button", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(ProfileMenu);

        await wrapper.find("button").trigger("click");

        await wrapper.find("[aria-label='Close menu']").trigger("click");

        expect(wrapper.find("[aria-label='Close menu']").exists()).toBe(false);
    });

    it("logs the user out after clicking logout", async () => {
        const logout = vi.fn();
        (auth as any).useAuth.mockReturnValue({
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
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
            loginWithRedirect: login,
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
        (auth as any).useAuth.mockReturnValue({
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

    it("offers an available update and applies it", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });
        const applyUpdate = vi.fn();

        const wrapper = mount(ProfileMenu, {
            global: {
                provide: {
                    [AppUpdateKey as symbol]: {
                        installedVersion: ref("1.9.4"),
                        available: ref({ kind: "store", version: "2.0.0" }),
                        checkedAt: ref(Date.now()),
                        applyUpdate,
                    },
                },
            },
        });

        await wrapper.find("button").trigger("click");

        const updateItem = wrapper.find("[data-test='menu-app-update']");
        expect(updateItem.text()).toBe("Update available");
        await updateItem.trigger("click");

        expect(applyUpdate).toHaveBeenCalledOnce();
        expect(wrapper.find("[aria-label='Close menu']").exists()).toBe(false);
    });

    it("has no update entry when the app is up to date", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(ProfileMenu, {
            global: {
                provide: {
                    [AppUpdateKey as symbol]: {
                        installedVersion: ref("2.0.0"),
                        available: ref(undefined),
                        checkedAt: ref(Date.now()),
                        applyUpdate: vi.fn(),
                    },
                },
            },
        });

        await wrapper.find("button").trigger("click");

        expect(wrapper.find("[data-test='menu-app-update']").exists()).toBe(false);
    });
});

describe("ProfileMenu downloads link", () => {
    const navigate = vi.fn();
    // Renders a custom RouterLink's slot, so the links inside the panel can be found and clicked.
    const RouterLinkStub = defineComponent({
        props: {
            to: { type: Object as PropType<{ name: string }>, required: true },
            custom: Boolean,
        },
        setup(props, { slots }) {
            return () =>
                slots.default?.({
                    isActive: false,
                    href: `/${props.to.name}`,
                    navigate: () => navigate(props.to),
                });
        },
    });

    beforeEach(() => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        setActivePinia(createTestingPinia());
        (auth as any).useAuth.mockReturnValue({ isAuthenticated: ref(false) });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const openMenu = async (provide: Record<symbol, unknown> = {}) => {
        const wrapper = mount(ProfileMenu, {
            global: { provide, stubs: { RouterLink: RouterLinkStub } },
        });
        await wrapper.find("button").trigger("click");
        return wrapper;
    };

    it("offers My Activity and no downloads link without the downloads service", async () => {
        const wrapper = await openMenu();

        expect(wrapper.text()).toContain("My Activity");
        expect(wrapper.find("[data-test='menu-downloads']").exists()).toBe(false);
        expect(wrapper.text()).not.toContain("My Downloads");
    });

    it("links to My Downloads beside My Activity", async () => {
        const wrapper = await openMenu(provideDownloadsStub(createDownloadsServiceStub()));

        const link = wrapper.get("[data-test='menu-downloads']");
        expect(link.text()).toBe("My Downloads");
        expect(wrapper.find("[data-test='menu-downloads-attention']").exists()).toBe(false);

        await link.trigger("click");
        expect(navigate).toHaveBeenCalledWith({ name: "downloads" });
        expect(wrapper.find("[aria-label='Close menu']").exists()).toBe(false);
    });

    it("shows how many downloads need attention", async () => {
        const service = createDownloadsServiceStub({ attentionCount: 2 });
        const wrapper = await openMenu(provideDownloadsStub(service));

        expect(wrapper.get("[data-test='menu-downloads-attention']").text()).toBe("2");

        service.attentionRef.value = 0;
        await nextTick();
        expect(wrapper.find("[data-test='menu-downloads-attention']").exists()).toBe(false);
    });
});
