import { describe, expect, it } from "vitest";
import { WebScreenWakeService } from "./screen-wake-web";

describe("WebScreenWakeService", () => {
    it("leaves display sleep to the OS", () => {
        const service = new WebScreenWakeService();

        expect(() => service.setKeepAwake()).not.toThrow();
    });
});
