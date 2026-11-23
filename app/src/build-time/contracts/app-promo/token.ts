import type { InjectionKey } from "vue";
import type { AppPromoService } from "./contract";

export const AppPromoKey: InjectionKey<AppPromoService> = Symbol("AppPromoService");
