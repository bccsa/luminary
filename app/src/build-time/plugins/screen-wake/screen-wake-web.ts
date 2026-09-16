import type { ScreenWakeService } from "@/build-time/contracts/screen-wake/contract";

/**
 * Browser {@link ScreenWakeService} backed by the Screen Wake Lock API. Where the API is
 * missing or the request is denied, the display follows the OS idle timeout.
 */
export class WebScreenWakeService implements ScreenWakeService {
    private wanted = false;
    private sentinel: WakeLockSentinel | undefined;
    private requesting = false;
    private listening = false;

    setKeepAwake(keepAwake: boolean): void {
        this.wanted = keepAwake;

        if (!keepAwake) {
            this.sentinel?.release().catch(() => undefined);
            this.sentinel = undefined;
            return;
        }

        if (!this.listening) {
            // The browser drops the lock whenever the page is hidden, so take it back on return.
            document.addEventListener("visibilitychange", this.onVisibilityChange);
            this.listening = true;
        }
        void this.acquire();
    }

    private onVisibilityChange = () => {
        if (document.visibilityState === "visible") void this.acquire();
    };

    private async acquire(): Promise<void> {
        if (!this.wanted || this.sentinel || this.requesting) return;
        if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;

        this.requesting = true;
        try {
            const sentinel = await navigator.wakeLock.request("screen");
            // Released while the request was in flight.
            if (!this.wanted) {
                await sentinel.release();
                return;
            }
            sentinel.addEventListener("release", () => {
                if (this.sentinel === sentinel) this.sentinel = undefined;
            });
            this.sentinel = sentinel;
        } catch {
            // Denied (e.g. battery saver or permissions policy): leave the display to the OS.
        } finally {
            this.requesting = false;
        }
    }
}
