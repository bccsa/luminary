import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { UPDATE_CHECK_INTERVAL_MS, WebAppUpdateService } from "./app-update-web";
import { installAppUpdate } from "./index";

function respondWith(body: unknown, ok = true) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok,
        json: async () => body,
    } as Response);
}

describe("WebAppUpdateService", () => {
    beforeEach(() => {
        vi.stubGlobal("__APP_BUILD_ID__", "build-1");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        (import.meta.env as { SSR: boolean }).SSR = false;
    });

    it("has no installed version to show", () => {
        expect(new WebAppUpdateService().installedVersion.value).toBeUndefined();
    });

    it("offers a reload when a new build is deployed", async () => {
        respondWith({ buildId: "build-2" });
        const service = new WebAppUpdateService();

        await service.check();

        expect(service.available.value).toEqual({ kind: "reload", version: "build-2" });
        expect(service.checkedAt.value).toBeTypeOf("number");
    });

    it("offers nothing while this build is the deployed one", async () => {
        respondWith({ buildId: "build-1" });
        const service = new WebAppUpdateService();

        await service.check();

        expect(service.available.value).toBeUndefined();
        expect(service.checkedAt.value).toBeTypeOf("number");
    });

    it("ignores a failed check", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
        const service = new WebAppUpdateService();

        await service.check();

        expect(service.available.value).toBeUndefined();
        expect(service.checkedAt.value).toBeUndefined();
    });

    it("checks again on an interval", async () => {
        vi.useFakeTimers();
        const fetchSpy = respondWith({ buildId: "build-1" });
        const service = new WebAppUpdateService();

        service.start();
        await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("reloads onto the new build", async () => {
        respondWith({ buildId: "build-2" });
        const replace = vi.fn();
        vi.stubGlobal("location", { href: "https://example.org/explore?x=1", replace });
        const service = new WebAppUpdateService();
        await service.check();

        service.applyUpdate();

        expect(String(replace.mock.calls[0][0])).toBe(
            "https://example.org/explore?x=1&__build=build-2",
        );
    });

    it("does not check for updates during the SSG prerender", () => {
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        const fetchSpy = respondWith({ buildId: "build-1" });
        (import.meta.env as { SSR: boolean }).SSR = true;

        installAppUpdate(createApp({}));

        expect(setIntervalSpy).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("checks for updates on the client", () => {
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        respondWith({ buildId: "build-1" });

        installAppUpdate(createApp({}));

        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });
});
