/**
 * Runtime detection without importing Capacitor.
 *
 * The luminary repo stays free of @capacitor/core; when the app runs inside a
 * Capacitor web view, the native shell injects `globalThis.Capacitor` with the
 * same API shape (getPlatform, isNativePlatform). Pure browser builds see
 * no bridge and default to web.
 */

export type RuntimePlatform = "web" | "ios" | "android";

export type RuntimeInfo = {
    isNative: boolean;
    platform: RuntimePlatform;
};

type CapacitorRuntimeBridge = {
    getPlatform: () => string;
    isNativePlatform: () => boolean;
};

function getCapacitorRuntimeBridge(): CapacitorRuntimeBridge | undefined {
    const candidate = (globalThis as { Capacitor?: unknown }).Capacitor;
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const c = candidate as Record<string, unknown>;
    const getPlatform = c.getPlatform;
    const isNativePlatform = c.isNativePlatform;
    if (typeof getPlatform !== "function" || typeof isNativePlatform !== "function") {
        return undefined;
    }
    return {
        getPlatform: getPlatform as CapacitorRuntimeBridge["getPlatform"],
        isNativePlatform: isNativePlatform as CapacitorRuntimeBridge["isNativePlatform"],
    };
}

export function getRuntimeInfo(): RuntimeInfo {
    const bridge = getCapacitorRuntimeBridge();
    if (!bridge) {
        return { isNative: false, platform: "web" };
    }

    const platform = bridge.getPlatform() as RuntimePlatform;

    return {
        isNative: bridge.isNativePlatform(),
        platform,
    };
}
