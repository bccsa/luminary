import type { App } from "vue";
import { getRuntimeInfo } from "@/platform/runtime";
import {
    installMediaServices,
    type MediaServicesInstallerOptions,
} from "@/platform/installers/media-services.installer";

/**
 * Registers platform-provided services (media player, etc.) via `app.provide`.
 * Call after Pinia and router so the app graph is ready; installers only depend on `App`.
 */
export const platformServicesPlugin = {
    install(app: App, options?: MediaServicesInstallerOptions) {
        installMediaServices(app, getRuntimeInfo(), options);
    },
};
