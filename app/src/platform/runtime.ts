import { Capacitor } from "@capacitor/core";

export type RuntimePlatform = "web" | "ios" | "android";

export type RuntimeInfo = {
    isNative: boolean;
    platform: RuntimePlatform;
}

export function getRuntimeInfo(): RuntimeInfo {
    const platform = Capacitor.getPlatform() as RuntimePlatform;

    return {
        isNative: Capacitor.isNativePlatform(),
        platform,
    };
}
