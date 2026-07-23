import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import TopBar from "./TopBar.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { isAuthPluginInstalled } from "@/auth";

vi.mock("@auth0/auth0-vue");
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

    // Regression (#1825): the login button is a sibling of the quick-controls wrapper, so
    // without a gap on the row it sits flush against the theme toggle on mobile.
    it("spaces the trailing controls so the login button isn't flush against them", () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(TopBar);

        expect(wrapper.get('[data-test="topBarRow"]').classes()).toContain("gap-2");
    });

    it("shows the profile menu trigger when logged out", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(TopBar);

        expect(wrapper.find("button[name='profile-menu-btn']").exists()).toBe(true);
    });

    it("shows the profile menu when logged out", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
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
