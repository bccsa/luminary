import type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";

/**
 * Browser {@link PlatformChromeService}: the page keeps its fade backing and
 * there is no OS status bar to manage.
 */
export class WebPlatformChromeService implements PlatformChromeService {
    readonly chromeFadeEnabled = true;

    setStatusBarHidden(): void {
        // Browsers have no app-controlled status bar.
    }
}
