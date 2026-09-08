import type { App } from "vue";
import { AuthFlowKey } from "@/build-time/contracts/auth-flow/token";
import type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";
import { isNativeApp } from "@/util/inAppBrowser";
import { WebAuthFlowService } from "./auth-flow-web";
import { NativeAuthFlowService } from "./auth-flow-native";

/**
 * The same SPA bundle runs in browsers and inside the packaged app, so the
 * platform is a runtime property rather than a build target — the service is
 * selected here instead of via the virtual-module map.
 */
export function createAuthFlowService(): AuthFlowService {
    return isNativeApp() ? new NativeAuthFlowService() : new WebAuthFlowService();
}

export function installAuthFlow(app: App): void {
    app.provide(AuthFlowKey, createAuthFlowService());
}

export { AuthFlowKey } from "@/build-time/contracts/auth-flow/token";
export type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";
