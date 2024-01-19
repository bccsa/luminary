import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import TopBar from "./TopBar.vue";
import * as auth0 from "@auth0/auth0-vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@auth0/auth0-vue");

describe("TopBar", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("shows the user's name", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            user: {
                name: "Test Person",
            },
        });

        const wrapper = mount(TopBar);

        expect(wrapper.html()).toContain("Test Person");
    });

    it("logs the user out after clicking logout", async () => {
        const logout = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            logout,
        });

        const wrapper = mount(TopBar);
        await wrapper.find("button").trigger("click");
        await wrapper.find("a").trigger("click");

        expect(logout).toHaveBeenCalled();
    });
});
