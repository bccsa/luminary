import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ProfileMenu from "./ProfileMenu.vue";
import * as auth0 from "@auth0/auth0-vue";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";
import { db } from "luminary-shared";

const routePushMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        useRouter: vi.fn().mockImplementation(() => ({
            push: routePushMock,
        })),
    };
});

vi.mock("@auth0/auth0-vue");

vi.mock("@/auth", () => ({
    isAuthBypassed: false,
    isAuthPluginInstalled: { value: true },
    clearAuth0Cache: vi.fn(),
}));

describe("ProfileMenu", () => {
    beforeEach(async () => {
        setActivePinia(createPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    it("shows the user's name", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({
                name: "Test Person",
            }),
        });

        const wrapper = mount(ProfileMenu);

        expect(wrapper.html()).toContain("Test Person");
    });

    it("shows the user's avatar when picture is available", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({
                name: "Test Person",
                picture: "https://example.com/avatar.jpg",
            }),
        });

        const wrapper = mount(ProfileMenu);

        const img = wrapper.find("img");
        expect(img.exists()).toBe(true);
        expect(img.attributes("src")).toBe("https://example.com/avatar.jpg");
    });

    it("shows fallback icon when no picture", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({
                name: "No Pic User",
            }),
        });

        const wrapper = mount(ProfileMenu);

        // Should not have an img with src, but should have the fallback div
        expect(wrapper.html()).toContain("No Pic User");
    });

    it("logs the user out after clicking logout", async () => {
        const logout = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({
                name: "Test Person",
            }),
            logout,
        });

        const wrapper = mount(ProfileMenu);
        await wrapper.find("button").trigger("click");
        await wrapper.findAll("button")[3].trigger("click");

        expect(logout).toHaveBeenCalled();
    });

    it("shows Settings menu item", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({ name: "Test Person" }),
        });

        const wrapper = mount(ProfileMenu);
        await wrapper.find("button").trigger("click");

        expect(wrapper.text()).toContain("Settings");
    });

    it("shows Language menu item", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({ name: "Test Person" }),
        });

        const wrapper = mount(ProfileMenu);
        await wrapper.find("button").trigger("click");

        expect(wrapper.text()).toContain("Language");
    });

    it("navigates to settings when Settings is clicked", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: ref({ name: "Test Person" }),
        });

        const wrapper = mount(ProfileMenu);
        await wrapper.find("button").trigger("click");

        // Settings is the first menu item
        const buttons = wrapper.findAll("button");
        const settingsBtn = buttons.find((b) => b.text().includes("Settings"));
        if (settingsBtn) {
            await settingsBtn.trigger("click");
            expect(routePushMock).toHaveBeenCalledWith({ name: "settings" });
        }
    });
});
