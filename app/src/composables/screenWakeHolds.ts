import { inject, onUnmounted } from "vue";
import { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";

/**
 * Holder ids currently keeping the display on. Shared by every caller so the
 * native service only hears about the combined value, not each caller's own.
 */
const holders = new Set<string>();
let applied: boolean | undefined;

/**
 * A named claim on keeping the display on. Several holders can be active at once;
 * the display stays on while any of them holds. Holds are released on unmount.
 */
export function useScreenWakeHold(id: string): { hold(): void; release(): void } {
    const screenWake = inject(ScreenWakeKey, undefined);

    function sync() {
        const keepAwake = holders.size > 0;
        if (keepAwake === applied) return;
        applied = keepAwake;
        screenWake?.setKeepAwake(keepAwake);
    }

    function hold() {
        holders.add(id);
        sync();
    }

    function release() {
        holders.delete(id);
        sync();
    }

    onUnmounted(release);

    return { hold, release };
}
