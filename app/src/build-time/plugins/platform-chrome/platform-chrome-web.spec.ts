import { afterEach, describe, expect, it, vi } from "vitest";
import { WebPlatformChromeService } from "./platform-chrome-web";

describe("WebPlatformChromeService", () => {
    it("keeps the browser chrome fade and makes status-bar updates a no-op", () => {
        const service = new WebPlatformChromeService();

        expect(service.chromeFadeEnabled).toBe(true);
        expect(() => service.setStatusBarHidden()).not.toThrow();
    });

    describe("holding the screen in landscape", () => {
        const define = (target: object, key: string, value: unknown) =>
            Object.defineProperty(target, key, { value, configurable: true, writable: true });
        afterEach(() => {
            define(screen, "orientation", undefined);
            define(document, "fullscreenEnabled", undefined);
            define(document, "fullscreenElement", null);
        });

        it("is not offered where the browser cannot lock the orientation", () => {
            define(screen, "orientation", {});
            define(document, "fullscreenEnabled", true);
            expect(new WebPlatformChromeService().lockLandscape).toBeUndefined();
        });

        it("goes full screen and turns sideways, and gives both back", async () => {
            const lock = vi.fn().mockResolvedValue(undefined);
            const unlock = vi.fn();
            define(screen, "orientation", { lock, unlock });
            define(document, "fullscreenEnabled", true);
            const request = vi.fn(async () => {
                define(document, "fullscreenElement", document.documentElement);
            });
            define(document.documentElement, "requestFullscreen", request);
            const exit = vi.fn(async () => {
                define(document, "fullscreenElement", null);
            });
            define(document, "exitFullscreen", exit);

            const service = new WebPlatformChromeService();
            service.lockLandscape!(true);
            expect(request).toHaveBeenCalled();
            await vi.waitFor(() => expect(lock).toHaveBeenCalledWith("landscape"));

            service.lockLandscape!(false);
            expect(unlock).toHaveBeenCalled();
            expect(exit).toHaveBeenCalled();
        });
    });
});
