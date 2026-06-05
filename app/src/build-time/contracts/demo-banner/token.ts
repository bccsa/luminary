import type { InjectionKey } from "vue";
import type { DemoBannerService } from "./contract";

export const DemoBannerKey: InjectionKey<DemoBannerService> = Symbol("DemoBannerService");
