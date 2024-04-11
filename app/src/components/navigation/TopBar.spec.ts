import { describe, it, expect, vi } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import TopBar from "./TopBar.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import ProfileMenu from "./ProfileMenu.vue";

vi.mock("@auth0/auth0-vue");

vi.mock("vue-router", () => ({
    RouterLink: RouterLinkStub,
    useRoute: vi.fn().mockImplementation(() => ({
        name: "home",
    })),
}));

describe("TopBar", () => {
    it("shows a login button when logged out", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(TopBar);

        expect(wrapper.html()).toContain("Log in");
        expect(wrapper.findComponent(ProfileMenu).exists()).toBe(false);
    });

    it("shows the profile menu when logged in", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
        });

        const wrapper = mount(TopBar, {
            shallow: true,
        });

        expect(wrapper.html()).not.toContain("Log in");
        expect(wrapper.findComponent(ProfileMenu).exists()).toBe(true);
    });
});
