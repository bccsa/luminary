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
                isLoading: ref(false),
            };

            const token = await auth.getToken(oauth as any);
            expect(getAccessTokenSilently).toHaveBeenCalledOnce();
            expect(token).toBe("token");
        });

        it("returns undefined when getAccessTokenSilently returns undefined", async () => {
            const getAccessTokenSilently = vi.fn().mockResolvedValue(undefined);
            const oauth = {
                isAuthenticated: ref(false),
                getAccessTokenSilently,
                isLoading: ref(false),
            };

            const token = await auth.getToken(oauth as any);
            expect(getAccessTokenSilently).toHaveBeenCalled();
            expect(token).toBeUndefined();
        });
    });
});
