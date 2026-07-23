import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import TopBar from "./TopBar.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import * as auth from "@/auth";
import { ref } from "vue";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { isAuthPluginInstalled } from "@/auth";

vi.mock("@/auth", async () => {
    const { ref } = await import("vue");
    return {
        isAuthPluginInstalled: ref(true),
        openProviderModal: vi.fn(),
        useAuth: vi.fn(() => ({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        })),
    };
});
const routePushMock = vi.fn();

vi.mock("vue-router", async () => {
    const actual = await vi.importActual("vue-router");
    return {
        ...actual,
        RouterLink: RouterLinkStub,
        useRoute: vi.fn().mockImplementation(() => ({
            name: "home",
        })),
        useRouter: () => ({
            push: routePushMock,
        }),
    };
});

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("TopBar", () => {
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
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        isAuthPluginInstalled.value = true;
    });

    afterEach(() => {
        vi.clearAllMocks();
        isAuthPluginInstalled.value = false;
    });

    it("shows the profile menu trigger when logged out", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(TopBar);

        expect(wrapper.find("button[name='profile-menu-btn']").exists()).toBe(true);
    });

    it("shows the profile menu when logged out", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(true),
            user: {
                name: "Test Person",
            },
        });

        const wrapper = mount(TopBar, {
            shallow: false,
        });

        const ProfileMenu = wrapper.findComponent({ name: "ProfileMenu" });

        expect(ProfileMenu.exists()).toBe(true);

        // The name now lives in the slide-in panel header; open it to assert.
        await ProfileMenu.find("button[name='profile-menu-btn']").trigger("click");
        expect(ProfileMenu.text()).toContain("Test Person");
    });
});
