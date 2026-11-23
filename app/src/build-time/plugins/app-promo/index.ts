import type { App } from "vue";
import { provideAppPromoHolder } from "./provide";

/**
 * The in-app promotion entry: no content, so the holder stays empty and every placement renders nothing. A build
 * target with promotions supplies its own entry, which hands its service to `provideAppPromo`.
 */
export function installAppPromo(app: App): void {
    provideAppPromoHolder(app);
}

export { AppPromoKey } from "@/build-time/contracts/app-promo/token";
export type { AppPromoService } from "@/build-time/contracts/app-promo/contract";
