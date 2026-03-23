/**
 * Returns true when running inside a Capacitor native shell.
 * Safe to call before Capacitor has fully initialised — it only inspects
 * the window object that Capacitor injects at startup.
 */
export const isCapacitorPlatform = (): boolean => {
    return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
};
