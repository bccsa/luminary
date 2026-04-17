import type { App } from "vue";
import { getRuntimeInfo } from "@/platform/core/runtime";
import {
    installMediaServices,
    type MediaServicesInstallerOptions,
} from "@/platform/media-player";

/**
 * Registers platform-provided services (media player, etc.) via `app.provide`.
 * Call after Pinia and router so the app graph is ready; installers only depend on `App`.
 */
export const platformServicesPlugin = {
    install(app: App, options?: MediaServicesInstallerOptions) {
        installMediaServices(app, getRuntimeInfo(), options);
    },
};
