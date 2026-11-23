import type { App } from "vue";
import { AnalyticsKey } from "@/build-time/contracts/analytics/token";
import { WebAnalyticsService } from "./analytics-web";

export function installAnalytics(app: App): void {
    app.provide(AnalyticsKey, new WebAnalyticsService());
}

export { AnalyticsKey } from "@/build-time/contracts/analytics/token";
export type { AnalyticsService } from "@/build-time/contracts/analytics/contract";
