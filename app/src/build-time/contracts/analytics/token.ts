import type { InjectionKey } from "vue";
import type { AnalyticsService } from "./contract";

export const AnalyticsKey: InjectionKey<AnalyticsService> = Symbol("AnalyticsService");
