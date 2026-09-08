import type { App } from "vue";
import { AuthFlowKey } from "@/build-time/contracts/auth-flow/token";
import { WebAuthFlowService } from "./auth-flow-web";

export function installAuthFlow(app: App): void {
    app.provide(AuthFlowKey, new WebAuthFlowService());
}

export { AuthFlowKey } from "@/build-time/contracts/auth-flow/token";
export type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";
