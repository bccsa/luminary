import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LoginPage from "./LoginPage.vue";
import * as auth0 from "@auth0/auth0-vue";
import { isConnected } from "luminary-shared";

vi.mock("vue-router");
vi.mock("@auth0/auth0-vue");

describe("LoginPage", () => {
    beforeEach(() => {
        isConnected.value = true;
    });

    it("can log in with BCC", async () => {
        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });

        const wrapper = mount(LoginPage, {
            props: {
                showLoginModal: true,
            },
        });

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

        const wrapper = mount(LoginPage, {
            props: {
                showLoginModal: true,
            },
        });

        await wrapper.find("button[data-test='login-guest']").trigger("click");

        expect(loginWithRedirect).toHaveBeenCalledOnce();
    });
});
