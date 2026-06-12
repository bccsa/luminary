import { describe, it, expect } from "vitest";
import { defineComponent } from "vue";
import { WebDemoBannerService } from "./demo-banner-web";

describe("WebDemoBannerService", () => {
    it("returns the banner component passed to the constructor", () => {
        const Banner = defineComponent({ name: "TestBanner", template: "<div />" });
        const service = new WebDemoBannerService(Banner);

        expect(service.getBannerComponent()).toBe(Banner);
    });
});
