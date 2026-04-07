import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import auth from "./auth";

describe("auth", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe("getToken", () => {
        it("calls getAccessTokenSilently when isAuthenticated is true", async () => {
            const getAccessTokenSilently = vi.fn().mockResolvedValue("token");
            const oauth = {
                isAuthenticated: ref(true),
                getAccessTokenSilently,
            };

            const token = await auth.getToken(oauth as any);
            expect(getAccessTokenSilently).toHaveBeenCalledOnce();
            expect(token).toBe("token");
        });

        it("does not call getAccessTokenSilently when isAuthenticated is false", async () => {
            const getAccessTokenSilently = vi.fn();
            const oauth = {
                isAuthenticated: ref(false),
                getAccessTokenSilently,
            };

            const token = await auth.getToken(oauth as any);
            expect(getAccessTokenSilently).not.toHaveBeenCalled();
            expect(token).toBeUndefined();
        });

        it("calls loginRedirect when getAccessTokenSilently throws", async () => {
            const getAccessTokenSilently = vi.fn().mockRejectedValue(new Error("token error"));
            const loginWithRedirect = vi.fn();
            const logout = vi.fn();
            const oauth = {
                isAuthenticated: ref(true),
                getAccessTokenSilently,
                loginWithRedirect,
                logout,
            };

            const token = await auth.getToken(oauth as any);
            expect(token).toBeUndefined();
            // loginRedirect should have been called (which calls loginWithRedirect)
            expect(loginWithRedirect).toHaveBeenCalled();
        });
    });

    describe("loginRedirect", () => {
        it("calls loginWithRedirect when retry count is less than 2", async () => {
            const loginWithRedirect = vi.fn();
            const logout = vi.fn();
            const oauth = { loginWithRedirect, logout } as any;

            localStorage.setItem("auth0AuthFailedRetryCount", "0");

            await auth.loginRedirect(oauth);

            expect(loginWithRedirect).toHaveBeenCalled();
            expect(logout).not.toHaveBeenCalled();
            expect(localStorage.getItem("auth0AuthFailedRetryCount")).toBe("1");
        });

        it("calls logout when retry count is 2 or more", async () => {
            const loginWithRedirect = vi.fn();
            const logout = vi.fn();
            const oauth = { loginWithRedirect, logout } as any;

            localStorage.setItem("auth0AuthFailedRetryCount", "2");

            await auth.loginRedirect(oauth);

            expect(logout).toHaveBeenCalled();
            expect(loginWithRedirect).not.toHaveBeenCalled();
            expect(localStorage.getItem("auth0AuthFailedRetryCount")).toBeNull();
            expect(localStorage.getItem("usedAuth0Connection")).toBeNull();
        });

        it("uses stored connection for login", async () => {
            const loginWithRedirect = vi.fn();
            const logout = vi.fn();
            const oauth = { loginWithRedirect, logout } as any;

            localStorage.setItem("usedAuth0Connection", "google-oauth2");
            localStorage.setItem("auth0AuthFailedRetryCount", "0");

            await auth.loginRedirect(oauth);

            expect(loginWithRedirect).toHaveBeenCalledWith(
                expect.objectContaining({
                    authorizationParams: expect.objectContaining({
                        connection: "google-oauth2",
                    }),
                }),
            );
        });

        it("increments retry count on each attempt", async () => {
            const loginWithRedirect = vi.fn();
            const logout = vi.fn();
            const oauth = { loginWithRedirect, logout } as any;

            localStorage.setItem("auth0AuthFailedRetryCount", "1");

            await auth.loginRedirect(oauth);

            expect(localStorage.getItem("auth0AuthFailedRetryCount")).toBe("2");
        });
    });
});
