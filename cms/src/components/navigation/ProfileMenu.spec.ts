import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ProfileMenu from "./ProfileMenu.vue";
import * as auth0 from "@auth0/auth0-vue";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";

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

describe("ProfileMenu", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
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
});
