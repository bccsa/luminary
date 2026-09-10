import { describe, expect, it } from "vitest";
import { WebPlatformChromeService } from "./platform-chrome-web";

describe("WebPlatformChromeService", () => {
    it("keeps the browser chrome fade and makes status-bar updates a no-op", () => {
        const service = new WebPlatformChromeService();

        expect(service.chromeFadeEnabled).toBe(true);
        expect(() => service.setStatusBarHidden()).not.toThrow();
    });
});
