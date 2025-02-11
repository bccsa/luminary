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
        isConnected.value = true;
        loginModalVisible.value = true;
    });

    it("can log in with BCC", async () => {
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
        const loginWithRedirect = vi.fn();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            loginWithRedirect,
        });

        const wrapper = mount(LoginModal);

        await wrapper.find("button[data-test='login-guest']").trigger("click");

        expect(loginWithRedirect).toHaveBeenCalledOnce();
    });
});
