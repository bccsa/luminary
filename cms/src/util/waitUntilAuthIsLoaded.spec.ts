import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

const isLoadingRef = ref(false);

vi.mock("@auth0/auth0-vue", () => ({
    useAuth0: () => ({
        isLoading: isLoadingRef,
    }),
}));

vi.mock("@/auth", () => ({
    isAuthBypassed: false,
    isAuthPluginInstalled: { value: true },
}));

import { waitUntilAuth0IsLoaded } from "./waitUntilAuth0IsLoaded";

describe("waitUntilAuth0IsLoaded", () => {
    beforeEach(() => {
        isLoadingRef.value = false;
    });

    it("calls callback immediately when Auth0 is already loaded", async () => {
        const callback = vi.fn();
        isLoadingRef.value = false;

        await waitUntilAuth0IsLoaded(callback);

        expect(callback).toHaveBeenCalledOnce();
    });

    it("resolves without error when no callback is provided", async () => {
        isLoadingRef.value = false;

        await expect(waitUntilAuth0IsLoaded()).resolves.toBeUndefined();
    });

    it("waits for isLoading to become false before calling callback", async () => {
        const callback = vi.fn();
        isLoadingRef.value = true;

        const promise = waitUntilAuth0IsLoaded(callback);

        await nextTick();
        expect(callback).not.toHaveBeenCalled();

        isLoadingRef.value = false;
        await nextTick();
        await promise;

        expect(callback).toHaveBeenCalledOnce();
    });
});
