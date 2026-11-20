import type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";

type LockableOrientation = ScreenOrientation & {
    lock?: (orientation: "landscape") => Promise<void>;
    unlock?: () => void;
};

/**
 * Browser {@link PlatformChromeService}: the page keeps its fade backing and
 * there is no OS status bar to manage.
 */
export class WebPlatformChromeService implements PlatformChromeService {
    readonly chromeFadeEnabled = true;

    /**
     * A browser turns the screen only from its own full screen, and only where it can lock the orientation
     * (Chrome on Android; not Safari on an iPhone), so it is offered only there.
     */
    readonly lockLandscape?: (locked: boolean) => void;

    constructor() {
        const orientation =
            typeof screen === "undefined"
                ? undefined
                : (screen.orientation as LockableOrientation | undefined);
        if (
            typeof document === "undefined" ||
            !document.fullscreenEnabled ||
            typeof orientation?.lock !== "function"
        ) {
            return;
        }
        const root = document.documentElement;
        const leaveFullscreen = () => {
            if (document.fullscreenElement === root) {
                void document.exitFullscreen().catch(() => undefined);
            }
        };
        this.lockLandscape = (locked) => {
            if (locked) {
                // Asked in the press itself: full screen needs the viewer's gesture.
                root.requestFullscreen()
                    .then(() => orientation.lock?.("landscape"))
                    .catch(leaveFullscreen);
                return;
            }
            orientation.unlock?.();
            leaveFullscreen();
        };
    }

    setStatusBarHidden(): void {
        // Browsers have no app-controlled status bar.
    }
}
