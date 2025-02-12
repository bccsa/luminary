import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LoginModal from "./LoginModal.vue";
import * as auth0 from "@auth0/auth0-vue";
import { isConnected } from "luminary-shared";
import { loginModalVisible } from "@/globalConfig";

vi.mock("vue-router");
vi.mock("@auth0/auth0-vue");

describe("LoginModal", () => {
    beforeEach(() => {
        loginModalVisible.value = true;
    });

    it("can't log in if you are not connected", async () => {
        isConnected.value = false;

        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });

        const wrapper = mount(LoginModal);

        expect(wrapper.html()).toContain(
            "You are offline. Please connect to the internet to log in.",
        );
        console.log(wrapper.html());
    });

    it("can log in with BCC", async () => {
        isConnected.value = true;

        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });

        const wrapper = mount(LoginModal);

        await wrapper.find("button[data-test='login-bcc']").trigger("click");

        expect(loginWithRedirect).toHaveBeenCalledWith(
            expect.objectContaining({
                authorizationParams: expect.objectContaining({ connection: "bcc-login" }),
            }),
        );
    });

    it("can log as guest", async () => {
        isConnected.value = true;

        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });

        const wrapper = mount(LoginModal);

        await wrapper.find("button[data-test='login-guest']").trigger("click");

        expect(loginWithRedirect).toHaveBeenCalledOnce();
    });
});
