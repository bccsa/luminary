import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import auth from "./auth";

describe("auth", () => {
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
    });
});
