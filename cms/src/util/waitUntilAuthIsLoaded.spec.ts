import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

const isLoadingRef = ref(false);

vi.mock("@/auth", () => ({
    isAuthBypassed: false,
    isAuthPluginInstalled: { value: true },
    useAuth: () => ({
        isLoading: isLoadingRef,
    }),
}));

import { waitUntilAuthIsLoaded } from "./waitUntilAuthIsLoaded";

describe("waitUntilAuthIsLoaded", () => {
    beforeEach(() => {
        isLoadingRef.value = false;
    });

    it("calls callback immediately when auth is already loaded", async () => {
        const callback = vi.fn();
        isLoadingRef.value = false;

        await waitUntilAuthIsLoaded(callback);

        expect(callback).toHaveBeenCalledOnce();
    });

    it("resolves without error when no callback is provided", async () => {
        isLoadingRef.value = false;

        await expect(waitUntilAuthIsLoaded()).resolves.toBeUndefined();
    });

    it("waits for isLoading to become false before calling callback", async () => {
        const callback = vi.fn();
        isLoadingRef.value = true;

        const promise = waitUntilAuthIsLoaded(callback);

        await nextTick();
        expect(callback).not.toHaveBeenCalled();

        isLoadingRef.value = false;
        await nextTick();
        await promise;

        expect(callback).toHaveBeenCalledOnce();
    });
});
