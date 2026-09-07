import type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";

type StatusBarBridge = {
    hide?: (opts?: { animation?: string }) => Promise<void>;
    show?: (opts?: { animation?: string }) => Promise<void>;
};

/**
 * Packaged-app {@link PlatformChromeService}: drives the OS status bar through
 * the runtime-injected bridge global and drops the fade backing — content
 * scrolls full-screen under a near-opaque pill there.
 */
export class NativePlatformChromeService implements PlatformChromeService {
    readonly chromeFadeEnabled = false;

    setStatusBarHidden(hidden: boolean): void {
        const statusBar = (
            window as unknown as {
                Capacitor?: { Plugins?: { StatusBar?: StatusBarBridge } };
            }
        ).Capacitor?.Plugins?.StatusBar;
        if (!statusBar) return;

        const call = hidden
            ? statusBar.hide?.({ animation: "FADE" })
            : statusBar.show?.({ animation: "FADE" });
        call?.catch(() => undefined);
    }
}
