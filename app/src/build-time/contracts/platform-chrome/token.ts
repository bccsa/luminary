import type { InjectionKey } from "vue";
import type { PlatformChromeService } from "./contract";

export const PlatformChromeKey: InjectionKey<PlatformChromeService> =
    Symbol("PlatformChromeService");
