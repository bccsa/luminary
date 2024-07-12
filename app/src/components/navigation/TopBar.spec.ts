import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import TopBar from "./TopBar.vue";
import * as auth0 from "@auth0/auth0-vue";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";
import { setActivePinia } from "pinia";

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
        setActivePinia(createTestingPinia());
    });

    it("shows a login button when logged out", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(TopBar);

        expect(wrapper.html()).toContain("Profile");
    });

    it("shows the profile menu when logged out", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
        });

        const wrapper = mount(TopBar, {
            shallow: true,
        });

        expect(wrapper.find("profile-menu-stub").exists()).toBe(true);
    });
});
