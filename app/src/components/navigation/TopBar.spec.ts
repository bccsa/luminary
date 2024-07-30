import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import TopBar from "./TopBar.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";

vi.mock("@auth0/auth0-vue");

vi.mock("vue-router", async () => {
    const actual = await vi.importActual("vue-router");
    return {
        ...actual,
        RouterLink: RouterLinkStub,
        useRoute: vi.fn().mockImplementation(() => ({
            name: "home",
        })),
    };
});

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
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("shows menu when logged out", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(TopBar);

        expect(wrapper.html()).toContain("Menu");
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
        expect(ProfileMenu.text()).toContain("Test Person");
    });
});
