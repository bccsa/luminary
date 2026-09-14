import type { InjectionKey } from "vue";
import type { ScreenWakeService } from "./contract";

export const ScreenWakeKey: InjectionKey<ScreenWakeService> = Symbol("ScreenWakeService");
