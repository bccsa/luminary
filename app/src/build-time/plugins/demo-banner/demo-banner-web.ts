import type { Component } from "vue";
import type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";

/**
 * Browser {@link DemoBannerService}: returns a dismissible banner component.
 */
export class WebDemoBannerService implements DemoBannerService {
    constructor(private readonly bannerComponent: Component) {}

    getBannerComponent(): Component {
        return this.bannerComponent;
    }
}
