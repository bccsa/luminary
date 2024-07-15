import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ProfileMenu from "./ProfileMenu.vue";
import * as auth0 from "@auth0/auth0-vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
}));

vi.mock("@auth0/auth0-vue");

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
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("shows the user's name", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
            user: {
                name: "Test Person",
            },
        });

        const wrapper = mount(ProfileMenu);
        console.log(wrapper.text());

        expect(wrapper.html()).toContain("Test Person");
    });

    it("logs the user out after clicking logout", async () => {
        const logout = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
            logout,
        });

        const wrapper = mount(ProfileMenu);
        await wrapper.find("button").trigger("click");
        await wrapper.findAll("button")[3].trigger("click");

        expect(logout).toHaveBeenCalled();
    });
});
