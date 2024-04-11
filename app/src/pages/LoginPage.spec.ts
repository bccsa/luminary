import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LoginPage from "./LoginPage.vue";
import { setActivePinia, createPinia } from "pinia";
import { usePostStore } from "@/stores/post";
import { mockCategory, mockPost } from "@/tests/mockData";
import { useTagStore } from "@/stores/tag";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";

vi.mock("vue-router");
vi.mock("@auth0/auth0-vue");

describe("LoginPage", () => {
    it("can log in with BCC", async () => {
        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });
        const wrapper = mount(LoginPage);

        await wrapper.find("button[data-test='login-bcc']").trigger("click");

        expect(loginWithRedirect).toHaveBeenCalledWith(
            expect.objectContaining({
                authorizationParams: expect.objectContaining({ connection: "bcc-login" }),
            }),
        );
    });

    it("can log as guest", async () => {
        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });
        const wrapper = mount(LoginPage);

        await wrapper.find("button[data-test='login-guest']").trigger("click");

        expect(loginWithRedirect).toHaveBeenCalledOnce();
    });
});
