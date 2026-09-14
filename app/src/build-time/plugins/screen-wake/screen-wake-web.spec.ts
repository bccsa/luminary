import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { WebScreenWakeService } from "./screen-wake-web";

class FakeSentinel extends EventTarget {
    release = vi.fn(async () => {
        this.dispatchEvent(new Event("release"));
    });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("WebScreenWakeService", () => {
    let visibility: DocumentVisibilityState;
    let sentinels: FakeSentinel[];
    let request: Mock<[], Promise<FakeSentinel>>;

    function setVisibility(state: DocumentVisibilityState) {
        visibility = state;
        document.dispatchEvent(new Event("visibilitychange"));
    }

    beforeEach(() => {
        visibility = "visible";
        sentinels = [];
        request = vi.fn(async () => {
            const sentinel = new FakeSentinel();
            sentinels.push(sentinel);
            return sentinel;
        });
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => visibility,
        });
        Object.defineProperty(navigator, "wakeLock", {
            configurable: true,
            value: { request },
        });
    });

    afterEach(() => {
        delete (document as { visibilityState?: unknown }).visibilityState;
        delete (navigator as { wakeLock?: unknown }).wakeLock;
    });

    it("requests a screen wake lock and releases it", async () => {
        const service = new WebScreenWakeService();

        service.setKeepAwake(true);
        await flush();
        expect(request).toHaveBeenCalledWith("screen");

        service.setKeepAwake(false);
        expect(sentinels[0].release).toHaveBeenCalled();
    });

    it("takes the lock back when the page becomes visible again", async () => {
        const service = new WebScreenWakeService();
        service.setKeepAwake(true);
        await flush();

        // The browser releases the lock when the page is hidden.
        setVisibility("hidden");
        await sentinels[0].release();
        setVisibility("visible");
        await flush();

        expect(request).toHaveBeenCalledTimes(2);
    });

    it("does not take the lock back once it is no longer wanted", async () => {
        const service = new WebScreenWakeService();
        service.setKeepAwake(true);
        await flush();
        service.setKeepAwake(false);

        setVisibility("hidden");
        setVisibility("visible");
        await flush();

        expect(request).toHaveBeenCalledTimes(1);
    });

    it("releases a lock granted after it was turned off", async () => {
        const service = new WebScreenWakeService();

        service.setKeepAwake(true);
        service.setKeepAwake(false);
        await flush();

        expect(sentinels[0].release).toHaveBeenCalled();
    });

    it("leaves the display to the OS when the request is denied", async () => {
        request.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
        const service = new WebScreenWakeService();

        expect(() => service.setKeepAwake(true)).not.toThrow();
        await flush();
    });

    it("does nothing where the API is unavailable", () => {
        delete (navigator as { wakeLock?: unknown }).wakeLock;
        const service = new WebScreenWakeService();

        expect(() => {
            service.setKeepAwake(true);
            service.setKeepAwake(false);
        }).not.toThrow();
    });
});
