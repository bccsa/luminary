import type { InjectionKey } from "vue";
import type { AppUpdateService } from "./contract";

export const AppUpdateKey: InjectionKey<AppUpdateService> = Symbol("AppUpdateService");
