import type { App } from "vue";
import { ShareKey } from "@/build-time/contracts/share/token";
import { WebShareService } from "./share-web";

export function installShare(app: App): void {
    app.provide(ShareKey, new WebShareService());
}

export { ShareKey } from "@/build-time/contracts/share/token";
export type { ShareService } from "@/build-time/contracts/share/contract";
